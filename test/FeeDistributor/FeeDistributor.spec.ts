import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { FeeDistributor, TestERC20, VePERP } from "../../typechain"
import { getLatestTimestamp, getWeekTimestamp } from "../shared/utilities"

chai.use(solidity)

describe("FeeDistributor", () => {
    const [admin, alice, bob, carol] = waffle.provider.getWallets()
    let vePERP: VePERP
    let feeDistributor: FeeDistributor
    let testPERP: TestERC20
    let testUSDC: TestERC20
    const DAY = 86400
    const WEEK = DAY * 7
    const MONTH = DAY * 30
    const YEAR = DAY * 365

    beforeEach(async () => {
        const testERC20Factory = await ethers.getContractFactory("TestERC20")
        testPERP = await testERC20Factory.deploy()
        await testPERP.__TestERC20_init("PERP", "PERP", 18)

        testUSDC = await testERC20Factory.deploy()
        await testUSDC.__TestERC20_init("USDC", "USDC", 6)

        const vePERPFactory = await ethers.getContractFactory("vePERP")
        vePERP = (await vePERPFactory.deploy(testPERP.address, "vePERP", "vePERP", "v1")) as VePERP

        const feeDistributorFactory = await ethers.getContractFactory("FeeDistributor")
        feeDistributor = (await feeDistributorFactory.deploy(
            vePERP.address,
            await getLatestTimestamp(),
            testUSDC.address,
            admin.address,
            admin.address,
        )) as FeeDistributor
        await feeDistributor.connect(admin).toggle_allow_checkpoint_token()

        await testPERP.mint(alice.address, parseEther("1000"))
        await testPERP.mint(bob.address, parseEther("1000"))
        await testPERP.mint(carol.address, parseEther("1000"))

        await testPERP.connect(alice).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(bob).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(carol).approve(vePERP.address, parseEther("1000"))
        await testUSDC.connect(admin).approve(feeDistributor.address, ethers.constants.MaxUint256)
    })

    describe("burn", () => {
        it("force error when token is not usdc", async () => {
            await expect(feeDistributor.connect(admin).burn(testPERP.address)).to.be.reverted
        })

        it("force error when contract is killed", async () => {
            await feeDistributor.connect(admin).kill_me()

            await expect(feeDistributor.connect(admin).burn(testUSDC.address)).to.be.reverted
        })

        it("burn correct amount", async () => {
            await testUSDC.mint(admin.address, parseUnits("1000", 6))
            const usdcBalanceBeforeFeeDistributor = await testUSDC.balanceOf(feeDistributor.address)
            const usdcBalanceBeforeAdmin = await testUSDC.balanceOf(admin.address)

            await feeDistributor.connect(admin).burn(testUSDC.address)

            const usdcBalanceAfterFeeDistributor = await testUSDC.balanceOf(feeDistributor.address)
            const usdcBalanceAfterAdmin = await testUSDC.balanceOf(admin.address)

            expect(usdcBalanceAfterFeeDistributor.sub(usdcBalanceBeforeFeeDistributor)).to.be.eq(parseUnits("1000", 6))
            expect(usdcBalanceBeforeAdmin.sub(usdcBalanceAfterAdmin)).to.be.eq(parseUnits("1000", 6))
        })
    })

    describe("distribute fee", () => {
        beforeEach(async () => {
            // (locked durations)
            // alice x-----------o
            // bob         x-----o
            // carol                   x-----o
            // ------|-----|-----|-----|-----|---------> week#
            //       1     2     3     4     5
            //                               ^claim (should claim all fees before week 5)

            // week1
            const week1 = getWeekTimestamp(await getLatestTimestamp(), false)
            await waffle.provider.send("evm_setNextBlockTimestamp", [week1])
            // alice lock 100 PERP for 2 weeks
            await vePERP.connect(alice).create_lock(parseEther("100"), week1 + 2 * WEEK)
            // checkpoint token
            await feeDistributor.checkpoint_token()
            await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
            // week1 fee: 1000 USDC
            await testUSDC.mint(admin.address, parseUnits("1000", 6))
            await feeDistributor.connect(admin).burn(testUSDC.address)

            // week2
            const week2 = week1 + WEEK
            await waffle.provider.send("evm_setNextBlockTimestamp", [week2])
            // bob lock 100 PERP for 1 week
            await vePERP.connect(bob).create_lock(parseEther("100"), week2 + WEEK)
            // checkpoint token
            await feeDistributor.checkpoint_token()
            await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
            // week2 fee: 1000 USD
            await testUSDC.mint(admin.address, parseUnits("1000", 6))
            await feeDistributor.connect(admin).burn(testUSDC.address)

            // week3
            const week3 = week2 + WEEK
            await waffle.provider.send("evm_setNextBlockTimestamp", [week3])
            // checkpoint token
            await feeDistributor.checkpoint_token()
            await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
            // week3 fee: 700 USD (intentionally different from other weeks because
            // we expect week3's fee to be unclaimable since no one owns vePERP during that week)
            await testUSDC.mint(admin.address, parseUnits("700", 6))
            await feeDistributor.connect(admin).burn(testUSDC.address)

            // week4
            const week4 = week3 + WEEK
            await waffle.provider.send("evm_setNextBlockTimestamp", [week4])
            // carol lock 100 PERP for 1 week
            await vePERP.connect(carol).create_lock(parseEther("100"), week4 + WEEK)
            // checkpoint token
            await feeDistributor.checkpoint_token()
            await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
            // week4 fee: 1000 USD
            await testUSDC.mint(admin.address, parseUnits("1000", 6))
            await feeDistributor.connect(admin).burn(testUSDC.address)

            // week5
            await waffle.provider.send("evm_setNextBlockTimestamp", [week4 + WEEK])
        })

        it("claim fees", async () => {
            // alice claim fees in week1 & week2
            const aliceRewards = parseUnits("1500", 6)
            await expect(feeDistributor.connect(alice)["claim()"]())
                .to.emit(feeDistributor, "Claimed")
                .withArgs(alice.address, aliceRewards, 1, 1)
            expect(await testUSDC.balanceOf(alice.address)).to.be.eq(aliceRewards)

            // bob claim fees in week2
            const bobRewards = parseUnits("500", 6)
            await expect(feeDistributor.connect(bob)["claim()"]())
                .to.emit(feeDistributor, "Claimed")
                .withArgs(bob.address, bobRewards, 1, 1)
            expect(await testUSDC.balanceOf(bob.address)).to.be.eq(bobRewards)

            // carol claim fees in week4
            const carolRewards = parseUnits("1000", 6)
            await expect(feeDistributor.connect(carol)["claim()"]())
                .to.emit(feeDistributor, "Claimed")
                .withArgs(carol.address, carolRewards, 1, 1)
            expect(await testUSDC.balanceOf(carol.address)).to.be.eq(carolRewards)

            // week3 reward will keep in feeDistributor contract
            const usdcBalanceFinal = await testUSDC.balanceOf(feeDistributor.address)
            expect(usdcBalanceFinal).to.be.eq(parseUnits("700", 6))
        })

        it("claim many", async () => {
            const addresses = new Array<string>(20)

            addresses[0] = alice.address
            addresses[1] = bob.address
            addresses[2] = carol.address
            addresses.fill(ethers.constants.AddressZero, 3, 20)
            // @ts-ignore
            const tx = await feeDistributor.claim_many(addresses)

            await expect(tx).to.emit(feeDistributor, "Claimed").withArgs(alice.address, parseUnits("1500", 6), 1, 1)
            await expect(tx).to.emit(feeDistributor, "Claimed").withArgs(bob.address, parseUnits("500", 6), 1, 1)
            await expect(tx).to.emit(feeDistributor, "Claimed").withArgs(carol.address, parseUnits("1000", 6), 1, 1)
        })
    })

    describe("claim fees in current week", () => {
        beforeEach(async () => {
            const week1 = getWeekTimestamp(await getLatestTimestamp(), false)
            // alice lock 100 PERP for 2 weeks
            await vePERP.connect(alice).create_lock(parseEther("100"), week1 + 2 * WEEK)

            await waffle.provider.send("evm_setNextBlockTimestamp", [week1])

            // checkpoint token
            await feeDistributor.checkpoint_token()
            await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
            // week1 fee: 1000 USDC
            await testUSDC.mint(admin.address, parseUnits("1000", 6))
            await feeDistributor.connect(admin).burn(testUSDC.address)
        })

        it("cannot claim fees in current week", async () => {
            await expect(feeDistributor.connect(alice)["claim()"]()).not.emit(feeDistributor, "Claimed")

            const usdcBalance = await testUSDC.balanceOf(feeDistributor.address)
            expect(usdcBalance).to.be.eq(parseUnits("1000", 6))
        })
    })
})
