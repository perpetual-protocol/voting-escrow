import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseEther } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { TestERC20, TestVePERPRewardDistributor, VePERP } from "../../typechain"
import { getLatestTimestamp } from "../shared/utilities"

chai.use(solidity)

describe("vePERPRewardDistributor", () => {
    const RANDOM_BYTES32_1 = "0x7c1b1e7c2eaddafdf52250cba9679e5b30014a9d86a0e2af17ec4cee24a5fc80"
    const RANDOM_BYTES32_2 = "0xb6801f31f93d990dfe65d67d3479c3853d5fafd7a7f2b8fad9e68084d8d409e0"
    const RANDOM_BYTES32_3 = "0x43bd90E4CC93D6E40580507102Cc7B1Bc8A25284a7f2b8fad9e68084d8d409e0"
    const [admin, alice, bob, carol] = waffle.provider.getWallets()
    const DAY = 86400
    const WEEK = DAY * 7
    const MONTH = 4 * WEEK
    const YEAR = 52 * WEEK
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

        await testPERP.connect(admin).approve(testVePERPRewardDistributor.address, ethers.constants.MaxUint256)
        await testPERP.connect(alice).approve(vePERP.address, ethers.constants.MaxUint256)
        await testPERP.connect(bob).approve(vePERP.address, ethers.constants.MaxUint256)
        await testPERP.connect(carol).approve(vePERP.address, ethers.constants.MaxUint256)
    })

    describe("seedAllocations()", () => {
        it("seed unallocated week, non-zero amount", async () => {
            await expect(testVePERPRewardDistributor.seedAllocations(1, RANDOM_BYTES32_1, parseEther("500")))
                .to.emit(testVePERPRewardDistributor, "AllocationSeeded")
                .withArgs(1, parseEther("500"))

            expect(await testPERP.balanceOf(admin.address)).to.eq(parseEther("500"))
            expect(await testPERP.balanceOf(testVePERPRewardDistributor.address)).to.eq(parseEther("500"))
            expect(await testVePERPRewardDistributor.weekMerkleRoots(1)).to.eq(RANDOM_BYTES32_1)
            expect(await testVePERPRewardDistributor.merkleRootIndexes(0)).to.eq(1)
        })

        it("force error when seed unallocated week, zero amount", async () => {
            await expect(
                testVePERPRewardDistributor.seedAllocations(1, RANDOM_BYTES32_1, parseEther("0")),
            ).to.be.revertedWith("vePRD_TIZ")
        })

        it("force error when seed allocated week", async () => {
            await testVePERPRewardDistributor.seedAllocations(1, RANDOM_BYTES32_1, parseEther("500"))
            await expect(
                testVePERPRewardDistributor.seedAllocations(1, RANDOM_BYTES32_1, parseEther("500")),
            ).to.be.revertedWith("cannot rewrite merkle root")
        })
    })

    describe("claimWeek()", () => {
        beforeEach(async () => {
            await testVePERPRewardDistributor.seedAllocations(1, RANDOM_BYTES32_1, parseEther("500"))
        })

        describe("lock time", () => {
            it("claim when user lock expiry is greater than the minimum lock duration", async () => {
                // alice lock 3 MONTH
                const timestamp = await getLatestTimestamp()
                await vePERP.connect(alice).create_lock(parseEther("100"), timestamp + YEAR)
                const aliceLockedBefore = (await vePERP.locked(alice.address)).amount

                await expect(() =>
                    testVePERPRewardDistributor
                        .connect(alice)
                        .claimWeek(alice.address, 1, parseEther("200"), [RANDOM_BYTES32_1]),
                ).to.changeTokenBalances(
                    testPERP,
                    [testVePERPRewardDistributor, vePERP],
                    [parseEther("-200"), parseEther("200")],
                )

                expect((await vePERP.locked(alice.address)).amount).to.be.eq(aliceLockedBefore.add(parseEther("200")))
            })

            it("force error when user lock expiry is less than the minimum lock duration", async () => {
                // alice lock 2 WEEK
                const timestamp = await getLatestTimestamp()
                await vePERP.connect(alice).create_lock(parseEther("100"), timestamp + 2 * WEEK)

                await expect(
                    testVePERPRewardDistributor
                        .connect(alice)
                        .claimWeek(alice.address, 1, parseEther("200"), [RANDOM_BYTES32_1]),
                ).revertedWith("vePRD_LTM")
            })

            it("force error when user does not have a lock", async () => {
                await expect(
                    testVePERPRewardDistributor
                        .connect(alice)
                        .claimWeek(alice.address, 1, parseEther("200"), [RANDOM_BYTES32_1]),
                ).revertedWith("vePRD_LTM")
            })
        })

        describe("weekly allocation", () => {
            beforeEach(async () => {
                await vePERP.connect(alice).create_lock(parseEther("10"), (await getLatestTimestamp()) + YEAR)
            })

            it("claim when the week is allocated and user is claimable", async () => {
                const aliceLockedBefore = (await vePERP.locked(alice.address)).amount

                await expect(
                    testVePERPRewardDistributor
                        .connect(alice)
                        .claimWeek(alice.address, 1, parseEther("200"), [RANDOM_BYTES32_1]),
                )
                    .to.emit(testVePERPRewardDistributor, "VePERPClaimed")
                    .withArgs(alice.address, 1, parseEther("200"))

                expect((await vePERP.locked(alice.address)).amount).to.be.eq(aliceLockedBefore.add(parseEther("200")))
            })

            it("claim for others", async () => {
                const aliceLockedBefore = (await vePERP.locked(alice.address)).amount

                await expect(
                    testVePERPRewardDistributor
                        .connect(bob)
                        .claimWeek(alice.address, 1, parseEther("200"), [RANDOM_BYTES32_1]),
                )
                    .to.emit(testVePERPRewardDistributor, "VePERPClaimed")
                    .withArgs(alice.address, 1, parseEther("200"))

                expect((await vePERP.locked(alice.address)).amount).to.be.eq(aliceLockedBefore.add(parseEther("200")))
            })

            it("force error when the week is already claimed", async () => {
                await testVePERPRewardDistributor
                    .connect(alice)
                    .claimWeek(alice.address, 1, parseEther("200"), [RANDOM_BYTES32_1])

                await expect(
                    testVePERPRewardDistributor
                        .connect(alice)
                        .claimWeek(alice.address, 1, parseEther("200"), [RANDOM_BYTES32_1]),
                ).to.be.revertedWith("vePRD_CA")
            })
        })
    })

    describe("claimWeeks()", () => {
        beforeEach(async () => {
            await testVePERPRewardDistributor.seedAllocations(1, RANDOM_BYTES32_1, parseEther("500"))
            await testVePERPRewardDistributor.seedAllocations(2, RANDOM_BYTES32_2, parseEther("500"))

            // alice lock 3 MONTH
            const timestamp = await getLatestTimestamp()
            await vePERP.connect(alice).create_lock(parseEther("100"), timestamp + 3 * MONTH)
        })

        it("claim when all weeks are allocated and meet lock time requirements", async () => {
            const aliceLockedBefore = (await vePERP.locked(alice.address)).amount

            const tx = await testVePERPRewardDistributor.claimWeeks(alice.address, [
                { week: 1, balance: parseEther("200"), merkleProof: [RANDOM_BYTES32_1] },
                { week: 2, balance: parseEther("100"), merkleProof: [RANDOM_BYTES32_2] },
            ])

            await expect(tx)
                .to.emit(testVePERPRewardDistributor, "VePERPClaimed")
                .withArgs(alice.address, 1, parseEther("200"))
            await expect(tx)
                .to.emit(testVePERPRewardDistributor, "VePERPClaimed")
                .withArgs(alice.address, 2, parseEther("100"))

            expect((await vePERP.locked(alice.address)).amount).to.be.eq(aliceLockedBefore.add(parseEther("300")))
        })

        it("force error when at least one of the weeks fail to meet the requirements", async () => {
            await testVePERPRewardDistributor.claimWeek(alice.address, 1, parseEther("200"), [RANDOM_BYTES32_1])

            await expect(
                testVePERPRewardDistributor.claimWeeks(alice.address, [
                    { week: 1, balance: parseEther("200"), merkleProof: [RANDOM_BYTES32_1] },
                    { week: 2, balance: parseEther("100"), merkleProof: [RANDOM_BYTES32_2] },
                ]),
            ).to.be.revertedWith("vePRD_CA")
        })
    })

    describe("getLengthOfMerkleRoots()", () => {
        it("get length when none is allocated", async () => {
            expect(await testVePERPRewardDistributor.getLengthOfMerkleRoots()).to.be.eq("0")
        })

        it("get length when at lest one is allocated", async () => {
            await testVePERPRewardDistributor.seedAllocations(1, RANDOM_BYTES32_1, parseEther("500"))
            expect(await testVePERPRewardDistributor.getLengthOfMerkleRoots()).to.be.eq("1")

            await testVePERPRewardDistributor.seedAllocations(2, RANDOM_BYTES32_2, parseEther("500"))
            expect(await testVePERPRewardDistributor.getLengthOfMerkleRoots()).to.be.eq("2")
        })
    })

    describe("admin", () => {
        it("set vePERP by admin", async () => {
            await expect(testVePERPRewardDistributor.setVePERP(testPERP.address))
                .to.emit(testVePERPRewardDistributor, "VePERPChanged")
                .withArgs(vePERP.address, testPERP.address)

            expect(await testVePERPRewardDistributor.getVePerp()).to.be.eq(testPERP.address)
        })

        it("force error when set vePERP by other", async () => {
            await expect(testVePERPRewardDistributor.connect(alice).setVePERP(testPERP.address)).to.be.revertedWith(
                "PerpFiOwnableUpgrade: caller is not the owner",
            )
        })

        it("force error when set vePERP to an EOA address", async () => {
            await expect(testVePERPRewardDistributor.setVePERP(alice.address)).to.be.revertedWith("vePRD_vePNC")
        })

        it("set minLockDuration by admin", async () => {
            await expect(testVePERPRewardDistributor.setMinLockDuration(WEEK))
                .to.emit(testVePERPRewardDistributor, "MinLockDurationChanged")
                .withArgs(3 * MONTH, WEEK)

            expect(await testVePERPRewardDistributor.getMinLockDuration()).to.be.eq(WEEK)
        })

        it("force error when set minLockDuration by other", async () => {
            await expect(testVePERPRewardDistributor.connect(alice).setMinLockDuration(WEEK)).to.be.revertedWith(
                "PerpFiOwnableUpgrade: caller is not the owner",
            )
        })
    })
})
