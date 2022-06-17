import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { FeeDistributor, TestERC20, VePERP } from "../../typechain"
import { getLatestTimestamp } from "../shared/utilities"

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

        await testPERP.mint(alice.address, parseEther("1000"))
        await testPERP.mint(bob.address, parseEther("1000"))
        await testPERP.mint(carol.address, parseEther("1000"))
        await testUSDC.mint(admin.address, parseUnits("1000", 6))

        await testPERP.connect(alice).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(bob).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(carol).approve(vePERP.address, parseEther("1000"))
        await testUSDC.connect(admin).approve(feeDistributor.address, parseUnits("1000", 6))
    })

    describe.only("burn", () => {
        it("force error when token is not usdc", async () => {
            await expect(feeDistributor.connect(admin).burn(testPERP.address)).to.be.reverted
        })

        it("force error when contract is killed", async () => {
            await feeDistributor.connect(admin).kill_me()

            await expect(feeDistributor.connect(admin).burn(testUSDC.address)).to.be.reverted
        })

        it("burn correct amount", async () => {
            const usdcBalanceBeforeFeeDistributor = await testUSDC.balanceOf(feeDistributor.address)
            const usdcBalanceBeforeAdmin = await testUSDC.balanceOf(admin.address)

            await feeDistributor.connect(admin).burn(testUSDC.address)

            const usdcBalanceAfterFeeDistributor = await testUSDC.balanceOf(feeDistributor.address)
            const usdcBalanceAfterAdmin = await testUSDC.balanceOf(admin.address)

            expect(usdcBalanceAfterFeeDistributor.sub(usdcBalanceBeforeFeeDistributor)).to.be.eq(parseUnits("1000", 6))
            expect(usdcBalanceBeforeAdmin.sub(usdcBalanceAfterAdmin)).to.be.eq(parseUnits("1000", 6))
        })
    })
})
