import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseEther } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { TestERC20, TestVePERPRewardDistributor, VePERP } from "../../typechain"

chai.use(solidity)

describe("vePERPRewardDistributor", () => {
    const RANDOM_BYTES32_1 = "0x7c1b1e7c2eaddafdf52250cba9679e5b30014a9d86a0e2af17ec4cee24a5fc80"
    const RANDOM_BYTES32_2 = "0xb6801f31f93d990dfe65d67d3479c3853d5fafd7a7f2b8fad9e68084d8d409e0"
    const RANDOM_BYTES32_3 = "0x43bd90E4CC93D6E40580507102Cc7B1Bc8A25284a7f2b8fad9e68084d8d409e0"
    const [admin, alice, bob, carol] = waffle.provider.getWallets()
    const DAY = 86400
    const WEEK = DAY * 7
    const MONTH = DAY * 30
    const YEAR = DAY * 365
    let vePERP: VePERP
    let testVePERPRewardDistributor: TestVePERPRewardDistributor
    let testPERP: TestERC20

    beforeEach(async () => {
        const testPERPFactory = await ethers.getContractFactory("TestERC20")
        testPERP = await testPERPFactory.deploy()
        await testPERP.__TestERC20_init("PERP", "PERP", 18)

        const vePERPFactory = await ethers.getContractFactory("vePERP")
        vePERP = (await vePERPFactory.deploy(testPERP.address, "vePERP", "vePERP", "v1")) as VePERP

        const vePERPRewardDistributorFactory = await ethers.getContractFactory("testVePERPRewardDistributor")
        testVePERPRewardDistributor = (await vePERPRewardDistributorFactory.deploy()) as TestVePERPRewardDistributor
        await testVePERPRewardDistributor.initialize(testPERP.address, vePERP.address, 3 * MONTH)

        await testPERP.mint(admin.address, parseEther("1000"))
        await testPERP.mint(alice.address, parseEther("1000"))
        await testPERP.mint(bob.address, parseEther("1000"))
        await testPERP.mint(carol.address, parseEther("1000"))

        await testPERP.connect(admin).approve(testVePERPRewardDistributor.address, parseEther("1000"))
        await testPERP.connect(alice).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(bob).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(carol).approve(vePERP.address, parseEther("1000"))
    })

    describe("seedAllocations()", () => {
        it("verify balances after seeding", async () => {
            await testVePERPRewardDistributor.seedAllocations(1, RANDOM_BYTES32_1, parseEther("500"))

            expect(await testPERP.balanceOf(admin.address)).to.eq(parseEther("500"))
            expect(await testPERP.balanceOf(testVePERPRewardDistributor.address)).to.eq(parseEther("500"))
            expect(await testVePERPRewardDistributor.weekMerkleRoots(1)).to.eq(RANDOM_BYTES32_1)
            expect(await testVePERPRewardDistributor.merkleRootIndexes(0)).to.eq(1)
        })
    })

    describe("claimWeek()", () => {
        beforeEach(async () => {
            await testVePERPRewardDistributor.seedAllocations(1, RANDOM_BYTES32_1, parseEther("500"))
        })

        it("force error when user lock time less then min lock time", async () => {
            // alice lock 2 WEEK
            const CURRENT_TIMESTAMP = 1717027200 // Thu May 30 00:00:00 UTC 2024
            await waffle.provider.send("evm_setNextBlockTimestamp", [CURRENT_TIMESTAMP])
            await vePERP.connect(alice).create_lock(parseEther("100"), CURRENT_TIMESTAMP + 2 * WEEK)

            await expect(
                testVePERPRewardDistributor
                    .connect(alice)
                    .claimWeek(alice.address, 1, parseEther("200"), [RANDOM_BYTES32_1]),
            ).revertedWith("less than minLockTime")
        })

        it("claim week when user lock time greater then min lock time", async () => {
            // alice lock 3 MONTH
            const CURRENT_TIMESTAMP = 1717113600
            await waffle.provider.send("evm_setNextBlockTimestamp", [CURRENT_TIMESTAMP])
            await vePERP.connect(alice).create_lock(parseEther("100"), CURRENT_TIMESTAMP + YEAR)

            await expect(() =>
                testVePERPRewardDistributor
                    .connect(alice)
                    .claimWeek(alice.address, 1, parseEther("200"), [RANDOM_BYTES32_1]),
            ).to.changeTokenBalances(
                testPERP,
                [testVePERPRewardDistributor, vePERP],
                [parseEther("-200"), parseEther("200")],
            )

            // TODO: need to check vePERP.balanceOf(alice.address) before/after
        })
    })
})
