import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { TestERC20, VePERP, VeTokenDistributor, VeTokenDistributor__factory } from "../../typechain"
import { getLatestTimestamp, getWeekTimestamp } from "../shared/utilities"

chai.use(solidity)

describe("VeTokenDistributor", () => {
    const [admin, alice, bob, carol] = waffle.provider.getWallets()
    let vePERP: VePERP
    let veTokenDistributor: VeTokenDistributor
    let testPERP: TestERC20
    let testUSDC: TestERC20
    const DAY = 86400
    const WEEK = DAY * 7
    const MONTH = DAY * 30
    const YEAR = DAY * 365
    const MIN_LOCK_DURATION = 4 * WEEK

    beforeEach(async () => {
        const testERC20Factory = await ethers.getContractFactory("TestERC20")
        testPERP = await testERC20Factory.deploy()
        await testPERP.__TestERC20_init("PERP", "PERP", 18)

        testUSDC = await testERC20Factory.deploy()
        await testUSDC.__TestERC20_init("USDC", "USDC", 18)

        const vePERPFactory = await ethers.getContractFactory("vePERP")
        vePERP = (await vePERPFactory.deploy(testPERP.address, "vePERP", "vePERP", "v1")) as VePERP

        const veTokenDistributorFactory = (await ethers.getContractFactory(
            "VeTokenDistributor",
        )) as VeTokenDistributor__factory

        veTokenDistributor = (await veTokenDistributorFactory.deploy(
            vePERP.address,
            await getLatestTimestamp(),
            testPERP.address,
            admin.address,
            admin.address,
        )) as VeTokenDistributor

        await testPERP.mint(alice.address, parseEther("1000"))
        await testPERP.mint(bob.address, parseEther("1000"))
        await testPERP.mint(carol.address, parseEther("1000"))

        await testPERP.connect(alice).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(bob).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(carol).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(admin).approve(veTokenDistributor.address, ethers.constants.MaxUint256)
    })

    describe("turn on checkpoint at deployment", async () => {
        beforeEach(async () => {
            await veTokenDistributor.connect(admin).toggle_allow_checkpoint_token()
        })

        describe("burn", () => {
            it("force error when token is not perp", async () => {
                await expect(veTokenDistributor.connect(admin).burn(testUSDC.address)).to.be.reverted
            })

            it("force error when contract is killed", async () => {
                await veTokenDistributor.connect(admin).kill_me()

                await expect(veTokenDistributor.connect(admin).burn(testPERP.address)).to.be.reverted
            })

            it("burn correct amount", async () => {
                await testPERP.mint(admin.address, parseEther("1000"))
                const perpBalanceBeforeFeeDistributor = await testPERP.balanceOf(veTokenDistributor.address)
                const perpBalanceBeforeAdmin = await testPERP.balanceOf(admin.address)

                await veTokenDistributor.connect(admin).burn(testPERP.address)

                const perpBalanceAfterFeeDistributor = await testPERP.balanceOf(veTokenDistributor.address)
                const perpBalanceAfterAdmin = await testPERP.balanceOf(admin.address)

                expect(perpBalanceAfterFeeDistributor.sub(perpBalanceBeforeFeeDistributor)).to.be.eq(parseEther("1000"))
                expect(perpBalanceBeforeAdmin.sub(perpBalanceAfterAdmin)).to.be.eq(parseEther("1000"))
            })
        })

        describe("distribute veToken", () => {
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
                await veTokenDistributor.checkpoint_token()
                await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
                // week1 veToken: 1000 vePERP
                await testPERP.mint(admin.address, parseEther("1000"))
                await veTokenDistributor.connect(admin).burn(testPERP.address)

                // week2
                const week2 = week1 + WEEK
                await waffle.provider.send("evm_setNextBlockTimestamp", [week2])
                // bob lock 100 PERP for 1 week
                await vePERP.connect(bob).create_lock(parseEther("100"), week2 + WEEK)
                // checkpoint token
                await veTokenDistributor.checkpoint_token()
                await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
                // week2 veToken: 1000 vePERP
                await testPERP.mint(admin.address, parseEther("1000"))
                await veTokenDistributor.connect(admin).burn(testPERP.address)

                // week3
                const week3 = week2 + WEEK
                await waffle.provider.send("evm_setNextBlockTimestamp", [week3])
                // checkpoint token
                await veTokenDistributor.checkpoint_token()
                await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
                // week3 veToken: 700 vePERP (intentionally different from other weeks because
                // we expect week3's fee to be unclaimable since no one owns vePERP during that week)
                await testPERP.mint(admin.address, parseEther("700"))
                await veTokenDistributor.connect(admin).burn(testPERP.address)

                // week4
                const week4 = week3 + WEEK
                await waffle.provider.send("evm_setNextBlockTimestamp", [week4])
                // carol lock 100 PERP for 1 week
                await vePERP.connect(carol).create_lock(parseEther("100"), week4 + WEEK)
                // checkpoint token
                await veTokenDistributor.checkpoint_token()
                await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
                // week4 veToken: 1000 vePERP
                await testPERP.mint(admin.address, parseEther("1000"))
                await veTokenDistributor.connect(admin).burn(testPERP.address)

                // week5
                await waffle.provider.send("evm_setNextBlockTimestamp", [week4 + WEEK])
            })

            it("claim veToken", async () => {
                // alice, bob, carol  withdraw before create a new lock
                await vePERP.connect(alice).withdraw()
                await vePERP.connect(bob).withdraw()
                await vePERP.connect(carol).withdraw()

                // alice, bob, carol create a new lock with 100 PERP
                const newLockAmount = parseEther("100")
                const latestTimestamp = await getLatestTimestamp()
                const weekTimestamp = getWeekTimestamp(latestTimestamp, false)
                await vePERP.connect(alice).create_lock(newLockAmount, weekTimestamp + MIN_LOCK_DURATION)
                await vePERP.connect(bob).create_lock(newLockAmount, weekTimestamp + MIN_LOCK_DURATION)
                await vePERP.connect(carol).create_lock(newLockAmount, weekTimestamp + MIN_LOCK_DURATION)

                // alice claim veToken in week1 & week2
                const aliceLockEnd = await vePERP.locked__end(alice.address)
                const aliceRewards = parseEther("1500")

                await expect(veTokenDistributor.connect(alice)["claim()"]())
                    .to.emit(veTokenDistributor, "Claimed")
                    .withArgs(alice.address, aliceRewards, 1, 3)
                    .to.emit(vePERP, "Deposit")
                    .withArgs(alice.address, aliceRewards, aliceLockEnd, 0, latestTimestamp + 4)

                const [aliceLockedAmount] = await vePERP.locked(alice.address)
                expect(aliceLockedAmount).to.be.eq(aliceRewards.add(newLockAmount))

                // bob claim veToken in week2
                const bobLockEnd = await vePERP.locked__end(bob.address)
                const bobRewards = parseEther("500")

                await expect(veTokenDistributor.connect(bob)["claim()"]())
                    .to.emit(veTokenDistributor, "Claimed")
                    .withArgs(bob.address, bobRewards, 1, 3)
                    .to.emit(vePERP, "Deposit")
                    .withArgs(bob.address, bobRewards, bobLockEnd, 0, latestTimestamp + 5)

                const [bobLockedAmount] = await vePERP.locked(bob.address)
                expect(bobLockedAmount).to.be.eq(bobRewards.add(newLockAmount))

                // carol claim veToken in week4
                const carolLockEnd = await vePERP.locked__end(carol.address)
                const carolRewards = parseEther("1000")

                await expect(veTokenDistributor.connect(carol)["claim()"]())
                    .to.emit(veTokenDistributor, "Claimed")
                    .withArgs(carol.address, carolRewards, 1, 3)
                    .to.emit(vePERP, "Deposit")
                    .withArgs(carol.address, carolRewards, carolLockEnd, 0, latestTimestamp + 6)

                const [carolLockedAmount] = await vePERP.locked(carol.address)
                expect(carolLockedAmount).to.be.eq(carolRewards.add(newLockAmount))

                // week3 reward will keep in feeDistributor contract
                const perpBalanceFinal = await testPERP.balanceOf(veTokenDistributor.address)
                expect(perpBalanceFinal).to.be.eq(parseEther("700"))
            })

            it("claim many", async () => {
                // alice, bob, carol  withdraw before create a new lock
                await vePERP.connect(alice).withdraw()
                await vePERP.connect(bob).withdraw()
                await vePERP.connect(carol).withdraw()

                // alice, bob, carol create a new lock with 100 PERP
                const newLockAmount = parseEther("100")
                const latestTimestamp = await getLatestTimestamp()
                const weekTimestamp = getWeekTimestamp(latestTimestamp, false)
                await vePERP.connect(alice).create_lock(newLockAmount, weekTimestamp + MIN_LOCK_DURATION)
                await vePERP.connect(bob).create_lock(newLockAmount, weekTimestamp + MIN_LOCK_DURATION)
                await vePERP.connect(carol).create_lock(newLockAmount, weekTimestamp + MIN_LOCK_DURATION)

                const aliceLockEnd = await vePERP.locked__end(alice.address)
                const aliceRewards = parseEther("1500")

                const bobLockEnd = await vePERP.locked__end(bob.address)
                const bobRewards = parseEther("500")

                const carolLockEnd = await vePERP.locked__end(carol.address)
                const carolRewards = parseEther("1000")

                const addresses = new Array<string>(20)

                addresses[0] = alice.address
                addresses[1] = bob.address
                addresses[2] = carol.address
                addresses.fill(ethers.constants.AddressZero, 3, 20)
                // @ts-ignore
                const tx = await veTokenDistributor.claim_many(addresses)

                await expect(tx)
                    .to.emit(veTokenDistributor, "Claimed")
                    .withArgs(alice.address, parseEther("1500"), 1, 3)
                    .to.emit(vePERP, "Deposit")
                    .withArgs(alice.address, aliceRewards, aliceLockEnd, 0, latestTimestamp + 4)

                await expect(tx)
                    .to.emit(veTokenDistributor, "Claimed")
                    .withArgs(bob.address, parseEther("500"), 1, 3)
                    .to.emit(vePERP, "Deposit")
                    .withArgs(bob.address, bobRewards, bobLockEnd, 0, latestTimestamp + 4)

                await expect(tx)
                    .to.emit(veTokenDistributor, "Claimed")
                    .withArgs(carol.address, parseEther("1000"), 1, 3)
                    .to.emit(vePERP, "Deposit")
                    .withArgs(carol.address, carolRewards, carolLockEnd, 0, latestTimestamp + 4)
            })
        })

        describe("distribute veToken by transfer PERP directly", () => {
            let week1: number

            beforeEach(async () => {
                // (locked durations)
                // alice x-----------o
                // ------|-----|-----|-----|-----|-----|-----> week#
                //       1     2     3     4     5     6

                // week1
                week1 = getWeekTimestamp(await getLatestTimestamp(), false)
                await waffle.provider.send("evm_setNextBlockTimestamp", [week1])
                // alice lock 100 PERP for 2 weeks
                await vePERP.connect(alice).create_lock(parseEther("100"), week1 + 2 * WEEK)
                // checkpoint token
                await veTokenDistributor.checkpoint_token()
                await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
                // week1 veToken: 1000 PERP
                await testPERP.mint(admin.address, parseEther("1000"))
                await testPERP.connect(admin).transfer(veTokenDistributor.address, parseEther("1000"))
            })

            it("claim all of veToken if we check point right after transfer", async () => {
                await veTokenDistributor.connect(admin).checkpoint_token()

                const nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
                await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp])

                // extend lock time to over min lock duration
                await vePERP.connect(alice).increase_unlock_time(nextWeekTimestamp + MIN_LOCK_DURATION)

                const [lockedAmountBefore] = await vePERP.locked(alice.address)

                // alice claim veToken in week1
                const aliceRewards = parseEther("1000")
                await expect(veTokenDistributor.connect(alice)["claim()"]())
                    .to.emit(veTokenDistributor, "Claimed")
                    .withArgs(alice.address, aliceRewards, 1, 2)
                    .to.emit(vePERP, "Deposit")
                    .withArgs(
                        alice.address,
                        aliceRewards,
                        nextWeekTimestamp + MIN_LOCK_DURATION,
                        0,
                        nextWeekTimestamp + 1,
                    )

                const [lockedAmountAfter] = await vePERP.locked(alice.address)

                expect(lockedAmountAfter.sub(lockedAmountBefore)).to.be.eq(aliceRewards)
            })

            it("claim part of veToken if we check point only in the next week", async () => {
                const week1PartialTimestamp = (await getLatestTimestamp()) + WEEK
                await waffle.provider.send("evm_setNextBlockTimestamp", [week1PartialTimestamp])

                // extend lock time to over min lock duration
                await vePERP.connect(alice).increase_unlock_time(week1PartialTimestamp + MIN_LOCK_DURATION)

                const aliceLockEnd = await vePERP.locked__end(alice.address)

                const week1PartialReward = "874996021423549121674"

                const [week1LockedAmountBefore] = await vePERP.locked(alice.address)
                // alice claim partial veToken in week1
                await expect(veTokenDistributor.connect(alice)["claim()"]())
                    .to.emit(veTokenDistributor, "Claimed")
                    .withArgs(alice.address, week1PartialReward, 1, 2)
                    .to.emit(vePERP, "Deposit")
                    .withArgs(alice.address, week1PartialReward, aliceLockEnd, 0, week1PartialTimestamp + 1)

                const [week1LockedAmountAfter] = await vePERP.locked(alice.address)
                expect(week1LockedAmountAfter.sub(week1LockedAmountBefore)).to.be.eq(week1PartialReward)

                const week2PartialTimestamp = (await getLatestTimestamp()) + WEEK
                await waffle.provider.send("evm_setNextBlockTimestamp", [week2PartialTimestamp])

                // extend lock time to over min lock duration
                await vePERP.connect(alice).increase_unlock_time(week2PartialTimestamp + MIN_LOCK_DURATION)

                // original expected value is 125.003978576450878325
                const week2PartialReward = "125003978576450878325"

                const [week2LockedAmountBefore] = await vePERP.locked(alice.address)

                // alice claim partial fees in week2
                await expect(veTokenDistributor.connect(alice)["claim()"]())
                    .to.emit(veTokenDistributor, "Claimed")
                    .withArgs(alice.address, week2PartialReward, 1, 4)
                    .to.emit(vePERP, "Deposit")
                    .withArgs(alice.address, week2PartialReward, aliceLockEnd.add(WEEK), 0, week2PartialTimestamp + 1)

                const [week2LockedAmountAfter] = await vePERP.locked(alice.address)
                expect(week2LockedAmountAfter.sub(week2LockedAmountBefore)).to.be.eq(week2PartialReward)
            })
        })

        describe("claim veToken in current week", () => {
            beforeEach(async () => {
                const week1 = getWeekTimestamp(await getLatestTimestamp(), false)
                // alice lock 100 PERP for 2 weeks
                await vePERP.connect(alice).create_lock(parseEther("100"), week1 + 2 * WEEK)

                await waffle.provider.send("evm_setNextBlockTimestamp", [week1])

                // checkpoint token
                await veTokenDistributor.checkpoint_token()
                await waffle.provider.send("evm_setNextBlockTimestamp", [(await getLatestTimestamp()) + DAY])
                // week1 veToken: 1000 vePERP
                await testPERP.mint(admin.address, parseEther("1000"))
                await veTokenDistributor.connect(admin).burn(testPERP.address)
            })

            it("cannot claim veToken in current week", async () => {
                const [lockedAmountBefore] = await vePERP.locked(alice.address)

                await expect(veTokenDistributor.connect(alice)["claim()"]())
                    .not.emit(veTokenDistributor, "Claimed")
                    .not.emit(vePERP, "Deposit")

                const [lockedAmountAfter] = await vePERP.locked(alice.address)

                expect(lockedAmountAfter).to.be.eq(lockedAmountBefore)
            })
        })
    })

    describe("toggle checkpoint", async () => {
        it("force error when called by non-admin", async () => {
            await expect(veTokenDistributor.connect(alice).toggle_allow_checkpoint_token()).to.be.reverted
        })

        it("toggle checkpoint after several weeks", async () => {
            const currentWeek = getWeekTimestamp(await getLatestTimestamp(), true)

            // alice lock 100 PERP for 3 weeks
            await vePERP.connect(alice).create_lock(parseEther("100"), currentWeek + 3 * WEEK)

            await waffle.provider.send("evm_setNextBlockTimestamp", [currentWeek + 2 * WEEK + 2 * DAY])

            await veTokenDistributor.connect(admin).toggle_allow_checkpoint_token()
            // distribute 1000 PERP
            await testPERP.mint(admin.address, parseEther("1000"))
            await veTokenDistributor.connect(admin).burn(testPERP.address)

            // week1: 1000/(7+7+2) * 7 = 437.5
            // week2: 1000/(7+7+2) * 7 = 437.5
            // week3: 1000/(7+7+2) * 2 = 125
            expect(await veTokenDistributor.tokens_per_week(currentWeek)).to.be.eq(parseEther("437.499367043739809404"))
            expect(await veTokenDistributor.tokens_per_week(currentWeek + WEEK)).to.be.eq(
                parseEther("437.499367043739809404"),
            )
            expect(await veTokenDistributor.tokens_per_week(currentWeek + 2 * WEEK)).to.be.eq(
                parseEther("125.001265912520381191"),
            )

            await waffle.provider.send("evm_setNextBlockTimestamp", [currentWeek + 3 * WEEK])

            // alice withdraw veToken first, then create a new lock again
            await vePERP.connect(alice).withdraw()
            await vePERP.connect(alice).create_lock(parseEther("100"), currentWeek + 4 * WEEK)

            // alice should be able to claim week2 & week3 fees, but not week1 because her lock was created during week1
            // 437.5 + 125 = 562.5
            const aliceRewards = parseEther("562.500632956260190595")
            const aliceLockEnd = await vePERP.locked__end(alice.address)
            const [aliceLockedAmountBefore] = await vePERP.locked(alice.address)
            const latestTimestamp = await getLatestTimestamp()

            await expect(veTokenDistributor.connect(alice)["claim()"]())
                .to.emit(veTokenDistributor, "Claimed")
                .withArgs(alice.address, aliceRewards, 1, 3)
                .to.emit(vePERP, "Deposit")
                .withArgs(alice.address, aliceRewards, aliceLockEnd, 0, latestTimestamp + 1)

            const [aliceLockedAmountAfter] = await vePERP.locked(alice.address)

            expect(aliceLockedAmountAfter.sub(aliceLockedAmountBefore)).to.be.eq(aliceRewards)
        })
    })

    describe("recover balance", async () => {
        beforeEach(async () => {
            await testUSDC.mint(veTokenDistributor.address, parseUnits("1000", 6))
            await testPERP.mint(veTokenDistributor.address, parseEther("1000"))
        })

        it("force error when called by non-admin", async () => {
            await expect(veTokenDistributor.connect(alice).recover_balance(testUSDC.address)).to.be.reverted
        })

        it("force error when trying to recover reward token", async () => {
            await expect(veTokenDistributor.connect(admin).recover_balance(testPERP.address)).to.be.reverted
        })

        it("recover balance to emergency return address", async () => {
            await expect(() =>
                veTokenDistributor.connect(admin).recover_balance(testUSDC.address),
            ).to.changeTokenBalance(testUSDC, admin, parseUnits("1000", 6))
        })
    })

    describe("min lock duration", async () => {
        beforeEach(async () => {
            await veTokenDistributor.connect(admin).toggle_allow_checkpoint_token()
            const currentWeek = getWeekTimestamp(await getLatestTimestamp(), true)

            // alice lock 100 PERP for 2 weeks
            await vePERP.connect(alice).create_lock(parseEther("100"), currentWeek + 2 * WEEK)

            await waffle.provider.send("evm_setNextBlockTimestamp", [currentWeek + 1 * WEEK + 1 * DAY])

            // distribute 1000 PERP
            await veTokenDistributor.connect(admin).checkpoint_token()
            await testPERP.mint(admin.address, parseEther("1000"))
            await testPERP.connect(admin).transfer(veTokenDistributor.address, parseEther("1000"))
            await veTokenDistributor.connect(admin).checkpoint_token()

            await waffle.provider.send("evm_setNextBlockTimestamp", [currentWeek + 2 * WEEK])
        })

        it("force error when call set_min_lock_duration by non-admin", async () => {
            await expect(veTokenDistributor.connect(alice).set_min_lock_duration(WEEK * 2)).to.be.reverted
        })

        it("force error when duration is zero after round down", async () => {
            await expect(veTokenDistributor.connect(admin).set_min_lock_duration(WEEK * 0.3)).to.be.reverted
        })

        it("should be able to set min lock duration", async () => {
            await expect(veTokenDistributor.connect(admin).set_min_lock_duration(WEEK * 1.4))
                .to.emit(veTokenDistributor, "MinLockDuration")
                .withArgs(WEEK)
        })

        describe("set duration to larger than zero", async () => {
            beforeEach(async () => {
                await veTokenDistributor.connect(admin).set_min_lock_duration(WEEK * 1)
            })

            it("force error when user's lock duration is less than min lock duration", async () => {
                await expect(veTokenDistributor.connect(alice)["claim()"]()).to.be.revertedWith(
                    "User lock time is not enough.",
                )
            })

            it("should be able to claim if user's lock time is larger than equal min lock duration", async () => {
                // withdraw old vePERP first, then create a new lock in order to claim new rewards
                const currentWeek = getWeekTimestamp(await getLatestTimestamp(), true)
                await vePERP.connect(alice).withdraw()
                await vePERP.connect(alice).create_lock(parseEther("100"), currentWeek + WEEK)

                const aliceRewards = parseEther("1000")
                const aliceLockEnd = await vePERP.locked__end(alice.address)
                const [aliceLockedAmountBefore] = await vePERP.locked(alice.address)
                const latestTimestamp = await getLatestTimestamp()

                await expect(veTokenDistributor.connect(alice)["claim()"]())
                    .to.emit(veTokenDistributor, "Claimed")
                    .withArgs(alice.address, aliceRewards, 1, 3)
                    .to.emit(vePERP, "Deposit")
                    .withArgs(alice.address, aliceRewards, aliceLockEnd, 0, latestTimestamp + 1)

                const [aliceLockedAmountAfter] = await vePERP.locked(alice.address)

                expect(aliceLockedAmountAfter.sub(aliceLockedAmountBefore)).to.be.eq(aliceRewards)
            })
        })
    })
})
