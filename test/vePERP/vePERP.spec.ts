import { MockContract, smock } from "@defi-wonderland/smock"
import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { TestERC20, TestERC20__factory, VePERP } from "../../typechain"
import { getLatestBlock, getLatestTimestamp, getWeekTimestamp } from "../shared/utilities"

chai.use(solidity)

describe("vePERP", () => {
    const [admin, alice, bob, carol] = waffle.provider.getWallets()
    let vePERP: VePERP
    let testPERP: TestERC20
    const DAY = 86400
    const WEEK = DAY * 7
    const MONTH = DAY * 30
    const YEAR = DAY * 365

    beforeEach(async () => {
        const testPERPFactory = await ethers.getContractFactory("TestERC20")
        testPERP = await testPERPFactory.deploy()
        await testPERP.__TestERC20_init("PERP", "PERP", 18)

        const vePERPFactory = await ethers.getContractFactory("vePERP")
        vePERP = (await vePERPFactory.deploy(testPERP.address, "vePERP", "vePERP", "v1")) as VePERP

        await testPERP.mint(alice.address, parseEther("1000"))
        await testPERP.mint(bob.address, parseEther("1000"))
        await testPERP.mint(carol.address, parseEther("1000"))

        await testPERP.connect(alice).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(bob).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(carol).approve(vePERP.address, parseEther("1000"))
    })

    async function checkPerpBalance(): Promise<void> {
        const currentEpoch = await vePERP.epoch()
        const ptHistory = await vePERP.point_history(currentEpoch)
        const totalPerp = await vePERP.totalPERPSupply()
        // console.log(ptHistory.perp_amt.toString(), " - ", totalPerp.toString())
        expect(totalPerp).to.be.eq(ptHistory.perp_amt)
    }

    describe("create lock", async () => {
        it("create lock for 1 week", async () => {
            const nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp])

            const lockAmount = parseEther("100")

            const oldPerpBalanceAlice = await testPERP.balanceOf(alice.address)
            const oldPerpBalanceVePERP = await testPERP.balanceOf(vePERP.address)

            const tx = await vePERP.connect(alice).create_lock(lockAmount, nextWeekTimestamp + WEEK)
            await expect(tx)
                .to.emit(vePERP, "Deposit")
                .withArgs(alice.address, lockAmount, nextWeekTimestamp + WEEK, 1, nextWeekTimestamp)
            await expect(tx).to.emit(vePERP, "Supply").withArgs(0, lockAmount)

            expect(await testPERP.balanceOf(alice.address)).to.be.eq(oldPerpBalanceAlice.sub(lockAmount))
            expect(await testPERP.balanceOf(vePERP.address)).to.be.eq(oldPerpBalanceVePERP.add(lockAmount))

            const balance = await vePERP["balanceOf(address)"](alice.address)
            const weightedBalance = await vePERP["balanceOfWeighted(address)"](alice.address)
            expect(balance).to.be.eq(lockAmount.div(YEAR).mul(WEEK))
            expect(weightedBalance).to.be.eq(lockAmount.div(YEAR).mul(WEEK).mul(3).add(lockAmount))

            expect(await vePERP.totalPERPSupply()).to.be.eq(lockAmount)
            expect(await vePERP["totalSupply()"]()).to.be.eq(balance)
            expect(await vePERP["totalSupplyWeighted()"]()).to.be.eq(weightedBalance)
            expect(await vePERP.supply()).to.be.eq(lockAmount)

            const locked = await vePERP.locked(alice.address)
            expect(locked.amount).to.be.eq(lockAmount)
            expect(locked.end).to.be.eq(nextWeekTimestamp + WEEK)

            await checkPerpBalance()
        })

        it("create lock for 1 year", async () => {
            const nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp])

            const lockAmount = parseEther("100")
            const lockTime = 364 * DAY // 52 weeks

            const oldPerpBalanceAlice = await testPERP.balanceOf(alice.address)
            const oldPerpBalanceVePERP = await testPERP.balanceOf(vePERP.address)

            const tx = await vePERP.connect(alice).create_lock(lockAmount, nextWeekTimestamp + lockTime)
            await expect(tx)
                .to.emit(vePERP, "Deposit")
                .withArgs(alice.address, lockAmount, nextWeekTimestamp + lockTime, 1, nextWeekTimestamp)
            await expect(tx).to.emit(vePERP, "Supply").withArgs(0, lockAmount)

            expect(await testPERP.balanceOf(alice.address)).to.be.eq(oldPerpBalanceAlice.sub(lockAmount))
            expect(await testPERP.balanceOf(vePERP.address)).to.be.eq(oldPerpBalanceVePERP.add(lockAmount))

            const blockNumber = await getLatestBlock()

            // balanceOf view functions
            const balance = await vePERP["balanceOf(address)"](alice.address)
            const weightedBalance = await vePERP["balanceOfWeighted(address)"](alice.address)
            expect(balance).to.be.eq(lockAmount.div(YEAR).mul(lockTime))
            expect(weightedBalance).to.be.eq(lockAmount.div(YEAR).mul(lockTime).mul(3).add(lockAmount))

            expect(await vePERP["balanceOfAt(address,uint256)"](alice.address, blockNumber)).to.be.eq(balance)
            expect(await vePERP["balanceOfAt(address,uint256,bool)"](alice.address, blockNumber, true)).to.be.eq(
                weightedBalance,
            )

            // total supply view functions
            expect(await vePERP.totalPERPSupply()).to.be.eq(lockAmount)
            expect(await vePERP["totalSupply()"]()).to.be.eq(balance)
            expect(await vePERP["totalSupplyWeighted()"]()).to.be.eq(weightedBalance)
            expect(await vePERP["totalSupplyAt(uint256)"](blockNumber)).to.be.eq(balance)
            expect(await vePERP["totalSupplyAt(uint256,bool)"](blockNumber, true)).to.be.eq(weightedBalance)
            expect(await vePERP.supply()).to.be.eq(lockAmount)

            const locked = await vePERP.locked(alice.address)
            expect(locked.amount).to.be.eq(lockAmount)
            expect(locked.end).to.be.eq(nextWeekTimestamp + lockTime)

            await checkPerpBalance()
        })

        it("force error, old tokens not withdrawn", async () => {
            const timestamp = await getLatestTimestamp()

            await vePERP.connect(alice).create_lock(parseEther("100"), timestamp + WEEK)

            await expect(vePERP.connect(alice).create_lock(parseEther("100"), timestamp + WEEK)).to.be.revertedWith(
                "Withdraw old tokens first",
            )
        })

        it("force error, lock time not in the future", async () => {
            const timestamp = await getLatestTimestamp()
            await expect(vePERP.connect(alice).create_lock(parseEther("100"), timestamp - WEEK)).to.be.revertedWith(
                "Can only lock until time in the future",
            )
        })

        it("force error, lock time exceeds 1 year", async () => {
            const timestamp = await getLatestTimestamp()
            await expect(vePERP.connect(alice).create_lock(parseEther("100"), timestamp + 2 * YEAR)).to.be.revertedWith(
                "Voting lock can be 1 year max",
            )
        })
    })

    describe("deposit for", async () => {
        beforeEach(async () => {
            // alice locks for 1 WEEK
            const lastTimestamp = await getLatestTimestamp()
            await vePERP.connect(alice).create_lock(parseEther("100"), lastTimestamp + WEEK)
        })

        it("force error, value is zero", async () => {
            await expect(vePERP.connect(bob).deposit_for(alice.address, 0)).to.be.reverted
        })

        it("force error, no existing lock", async () => {
            await expect(vePERP.connect(bob).deposit_for(bob.address, 100)).to.be.revertedWith("No existing lock found")
        })

        it("force error, lock is expired", async () => {
            const lastTimestamp = await getLatestTimestamp()
            await waffle.provider.send("evm_setNextBlockTimestamp", [lastTimestamp + 2 * WEEK])

            await expect(vePERP.connect(bob).deposit_for(alice.address, 100)).to.be.revertedWith(
                "Cannot add to expired lock. Withdraw",
            )
        })

        it("deposit for alice", async () => {
            const oldLock = await vePERP.locked(alice.address)
            await expect(() =>
                vePERP.connect(bob).deposit_for(alice.address, parseEther("100")),
            ).to.changeTokenBalances(testPERP, [vePERP, alice, bob], [parseEther("100"), 0, parseEther("-100")])

            const newLock = await vePERP.locked(alice.address)
            expect(newLock.amount).to.be.eq(oldLock.amount.add(parseEther("100")))
            expect(newLock.end).to.be.eq(oldLock.end)

            await checkPerpBalance()
        })
    })

    describe("increase unlock time", async () => {
        let lastTimestamp: number

        beforeEach(async () => {
            lastTimestamp = await getLatestTimestamp()
            await vePERP.connect(alice).create_lock(parseEther("100"), lastTimestamp + WEEK)
        })

        it("increase unlock time for another 1 week", async () => {
            const oldLock = await vePERP.locked(alice.address)
            const lastTimestamp = await getLatestTimestamp()

            // increase unlock time for 1 week
            const tx = vePERP.connect(alice).increase_unlock_time(oldLock.end.add(WEEK))
            await expect(tx)
                .to.emit(vePERP, "Deposit")
                .withArgs(alice.address, "0", oldLock.end.add(WEEK), 3, lastTimestamp + 1)
            await expect(tx).to.emit(vePERP, "Supply").withArgs(parseEther("100"), parseEther("100"))

            const newLock = await vePERP.locked(alice.address)

            expect(newLock.end).to.be.eq(oldLock.end.add(WEEK))
            expect(newLock.amount).to.be.eq(oldLock.amount)

            await checkPerpBalance()
        })

        it("force error, lock expired", async () => {
            const oldLock = await vePERP.locked(alice.address)

            await waffle.provider.send("evm_setNextBlockTimestamp", [oldLock.end.toNumber() + DAY])
            await waffle.provider.send("evm_mine", [])
            lastTimestamp = await getLatestTimestamp()

            await expect(vePERP.connect(alice).increase_unlock_time(lastTimestamp)).to.be.revertedWith("Lock expired")
        })

        it("force error, lock time exceeds max lock time", async () => {
            await expect(vePERP.connect(alice).increase_unlock_time(lastTimestamp + 2 * YEAR)).to.be.revertedWith(
                "Voting lock can be 1 year max",
            )
        })

        it("force error, can only increase lock duration", async () => {
            await expect(vePERP.connect(alice).increase_unlock_time(lastTimestamp + WEEK)).to.be.revertedWith(
                "Can only increase lock duration",
            )
        })
    })

    describe("increase lock amount", () => {
        beforeEach(async () => {
            const timestamp = await getLatestTimestamp()
            await vePERP.connect(alice).create_lock(parseEther("100"), timestamp + WEEK)
        })

        it("force error, value is zero", async () => {
            await expect(vePERP.connect(alice).increase_amount(parseEther("0"))).to.be.reverted
        })

        it("force error, lock amount is zero", async () => {
            await expect(vePERP.connect(bob).increase_amount(parseEther("100"))).to.be.revertedWith(
                "No existing lock found",
            )
        })

        it("force error, lock is expired", async () => {
            const timestamp = await getLatestTimestamp()
            await waffle.provider.send("evm_setNextBlockTimestamp", [timestamp + 2 * WEEK])
            await waffle.provider.send("evm_mine", [])

            await expect(vePERP.connect(alice).increase_amount(parseEther("100"))).to.be.revertedWith(
                "Cannot add to expired lock. Withdraw",
            )
        })

        it("increase amount", async () => {
            const oldLock = await vePERP.locked(alice.address)

            await expect(() => vePERP.connect(alice).increase_amount(parseEther("100"))).to.changeTokenBalances(
                testPERP,
                [vePERP, alice],
                [parseEther("100"), parseEther("-100")],
            )

            const newLock = await vePERP.locked(alice.address)

            expect(newLock.end).to.be.eq(oldLock.end)
            expect(newLock.amount).to.be.eq(oldLock.amount.add(parseEther("100")))

            await checkPerpBalance()
        })
    })

    describe("withdraw", async () => {
        beforeEach(async () => {
            const timestamp = await getLatestTimestamp()
            await vePERP.connect(alice).create_lock(parseEther("100"), timestamp + WEEK)
        })

        it("force error, lock is not expired", async () => {
            await expect(vePERP.connect(alice).withdraw()).to.be.revertedWith("The lock didn't expire")
        })

        it("withdraw when lock expired", async () => {
            const timestamp = await getLatestTimestamp()
            await waffle.provider.send("evm_setNextBlockTimestamp", [timestamp + 2 * WEEK])

            await expect(() => vePERP.connect(alice).withdraw()).to.changeTokenBalance(
                testPERP,
                alice,
                parseEther("100"),
            )

            const newLock = await vePERP.locked(alice.address)

            expect(newLock.amount).to.be.eq(parseEther("0"))
            expect(await testPERP.balanceOf(alice.address)).to.be.eq(parseEther("1000"))

            await checkPerpBalance()
        })
    })

    describe("point history", async () => {
        it("point timestamp of current epoch is not necessarily aligned by week", async () => {
            const nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            // off by 1 second so we know that the next tx would not be aligned by week
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp + 1])

            await vePERP.connect(alice).create_lock(parseEther("100"), nextWeekTimestamp + WEEK + 1)

            const epoch = await vePERP.epoch()
            const point = await vePERP.point_history(epoch)
            expect(point.ts).to.be.eq(nextWeekTimestamp + 1)
        })

        it("filled history points are aligned by week", async () => {
            const nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)

            // epoch 0 checkpoint @ nextWeekTimestamp + 1
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp + 1])
            await vePERP.connect(alice).create_lock(parseEther("100"), nextWeekTimestamp + WEEK * 3)

            // epoch 2 checkpoint @ nextWeekTimestamp + WEEK + 1
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp + WEEK + 1])
            await vePERP.connect(bob).create_lock(parseEther("100"), nextWeekTimestamp + WEEK * 3)

            // epoch 1 should be retro-checkpoint @ nextWeekTimestamp + WEEK
            const epoch = await vePERP.epoch()
            const point = await vePERP.point_history(epoch.sub(1))
            expect(point.ts).to.be.eq(nextWeekTimestamp + WEEK)
        })
    })

    describe("get voting power and total supply in history epoch", async () => {
        let week1Timestamp
        let week2Timestamp
        let week3Timestamp
        let week4Timestamp
        let week5Timestamp
        let week6Timestamp
        let week7Timestamp

        const lockAmount = parseEther("100")
        const slope = lockAmount.div(YEAR)
        let startBlockNumber: number

        beforeEach(async () => {
            startBlockNumber = await getLatestBlock()
            const startWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            week1Timestamp = startWeekTimestamp + WEEK
            week2Timestamp = startWeekTimestamp + WEEK * 2
            week3Timestamp = startWeekTimestamp + WEEK * 3
            week4Timestamp = startWeekTimestamp + WEEK * 4
            week5Timestamp = startWeekTimestamp + WEEK * 5
            week6Timestamp = startWeekTimestamp + WEEK * 6
            week7Timestamp = startWeekTimestamp + WEEK * 7

            // week 1
            await waffle.provider.send("evm_setNextBlockTimestamp", [week1Timestamp])
            await vePERP.connect(alice).create_lock(lockAmount, week1Timestamp + 5 * WEEK)

            await waffle.provider.send("evm_setNextBlockTimestamp", [week1Timestamp + 2 * DAY])
            await vePERP.connect(bob).create_lock(lockAmount, week1Timestamp + WEEK)

            // week 2~3

            // week 4
            await waffle.provider.send("evm_setNextBlockTimestamp", [week4Timestamp])
            await vePERP.connect(carol).create_lock(lockAmount, week4Timestamp + WEEK)

            // week 5
            await waffle.provider.send("evm_setNextBlockTimestamp", [week5Timestamp])
            // alice original expired at week6, new expire time will be week7
            await vePERP.connect(alice).increase_unlock_time(week5Timestamp + 2 * WEEK)
        })

        it("get history voting powers & total supply", async () => {
            // assume current time is week5

            // get historical data
            const balanceWeek1 = await vePERP["balanceOf(address,uint256)"](alice.address, week1Timestamp)
            expect(balanceWeek1).to.be.eq(slope.mul(5 * WEEK))
            expect(await vePERP["balanceOfAt(address,uint256)"](alice.address, startBlockNumber + 1)).to.be.eq(
                balanceWeek1,
            )

            const balanceWeek2 = await vePERP["balanceOf(address,uint256)"](alice.address, week2Timestamp)
            expect(balanceWeek2).to.be.eq(slope.mul(4 * WEEK))

            const balanceWeek3 = await vePERP["balanceOf(address,uint256)"](alice.address, week3Timestamp)
            expect(balanceWeek3).to.be.eq(slope.mul(3 * WEEK))

            const balanceWeek3Weighted = await vePERP["balanceOfWeighted(address,uint256)"](
                alice.address,
                week3Timestamp,
            )
            expect(balanceWeek3Weighted).to.be.eq(lockAmount.add(slope.mul(3 * WEEK).mul(3)))

            // alice increased unlock time on week 5, so she still has 2 weeks to unlock
            const balanceWeek5 = await vePERP["balanceOf(address,uint256)"](alice.address, week5Timestamp)
            expect(balanceWeek5).to.be.eq(slope.mul(2 * WEEK))
            expect(await vePERP["balanceOfAt(address,uint256)"](alice.address, startBlockNumber + 4)).to.be.eq(
                balanceWeek5,
            )

            // get future data
            const balanceWeek6 = await vePERP["balanceOf(address,uint256)"](alice.address, week6Timestamp)
            expect(balanceWeek6).to.be.eq(slope.mul(1 * WEEK))

            // alice's lock is expired
            const balanceWeek7 = await vePERP["balanceOf(address,uint256)"](alice.address, week7Timestamp)
            const balanceWeek7Weighted = await vePERP["balanceOfWeighted(address,uint256)"](
                alice.address,
                week7Timestamp,
            )

            expect(balanceWeek7).to.be.eq("0")
            expect(balanceWeek7Weighted).to.be.eq(lockAmount)
            // get history total supply
            const totalSupplyWeek1 = await vePERP["totalSupply(uint256)"](week1Timestamp)
            expect(totalSupplyWeek1).to.be.eq(await vePERP["balanceOf(address,uint256)"](alice.address, week1Timestamp))
            expect(totalSupplyWeek1).to.be.eq(await vePERP["totalSupplyAt(uint256)"](startBlockNumber + 1))

            const totalSupplyWeek2 = await vePERP["totalSupply(uint256)"](week2Timestamp)
            const aliceBalanceWeek2 = await vePERP["balanceOf(address,uint256)"](alice.address, week2Timestamp)
            const bobBalanceWeek2 = await vePERP["balanceOf(address,uint256)"](bob.address, week2Timestamp)
            expect(totalSupplyWeek2).to.be.eq(aliceBalanceWeek2.add(bobBalanceWeek2))

            const totalSupplyWeek3 = await vePERP["totalSupply(uint256)"](week3Timestamp)
            const aliceBalanceWeek3 = await vePERP["balanceOf(address,uint256)"](alice.address, week3Timestamp)
            const bobBalanceWeek3 = await vePERP["balanceOf(address,uint256)"](bob.address, week3Timestamp)
            expect(totalSupplyWeek3).to.be.eq(aliceBalanceWeek3.add(bobBalanceWeek3))

            const totalSupplyWeightedWeek3 = await vePERP["totalSupplyWeighted(uint256)"](week3Timestamp)
            const aliceBalanceWeightedWeek3 = await vePERP["balanceOfWeighted(address,uint256)"](
                alice.address,
                week3Timestamp,
            )
            const bobBalanceWeightedWeek3 = await vePERP["balanceOfWeighted(address,uint256)"](
                bob.address,
                week3Timestamp,
            )
            expect(totalSupplyWeightedWeek3).to.be.eq(aliceBalanceWeightedWeek3.add(bobBalanceWeightedWeek3))

            const totalSupplyWeek4 = await vePERP["totalSupply(uint256)"](week4Timestamp)
            const aliceBalanceWeek4 = await vePERP["balanceOf(address,uint256)"](alice.address, week4Timestamp)
            const bobBalanceWeek4 = await vePERP["balanceOf(address,uint256)"](bob.address, week4Timestamp)
            const carolBalanceWeek4 = await vePERP["balanceOf(address,uint256)"](carol.address, week4Timestamp)
            expect(totalSupplyWeek4).to.be.eq(aliceBalanceWeek4.add(bobBalanceWeek4).add(carolBalanceWeek4))

            // get future total supply

            const totalSupplyWeek7 = await vePERP["totalSupply(uint256)"](week7Timestamp)
            expect(totalSupplyWeek7).to.be.eq("0")

            const totalSupplyWeightedWeek7 = await vePERP["totalSupplyWeighted(uint256)"](week7Timestamp)
            // sum of alice & bob & carol's lock amount
            expect(totalSupplyWeightedWeek7).to.be.eq(lockAmount.mul(3))

            // return 0 when timestamp is before week 0
            const timestampBeforeWeek1 = week1Timestamp - 100
            expect(await vePERP["totalSupply(uint256)"](timestampBeforeWeek1)).to.be.eq("0")
            expect(await vePERP["balanceOf(address,uint256)"](alice.address, timestampBeforeWeek1)).to.be.eq("0")

            await checkPerpBalance()
        })
    })

    describe("emergency unlock", async () => {
        beforeEach(async () => {
            const timestamp = await getLatestTimestamp()
            await vePERP.connect(alice).create_lock(parseEther("100"), timestamp + 5 * WEEK)
            await vePERP.connect(bob).create_lock(parseEther("100"), timestamp + WEEK)
            await waffle.provider.send("evm_setNextBlockTimestamp", [timestamp + 2 * WEEK])
        })

        it("force error, only admin", async () => {
            await expect(vePERP.connect(alice).toggleEmergencyUnlock()).to.be.reverted
        })

        it("withdraw after emergency unlock", async () => {
            await vePERP.connect(admin).toggleEmergencyUnlock()

            const timestamp = await getLatestTimestamp()
            await expect(vePERP.connect(alice).withdraw())
                .to.emit(vePERP, "Withdraw")
                .withArgs(alice.address, parseEther("100"), timestamp + 1)
                .to.emit(vePERP, "Supply")
                .withArgs(parseEther("200"), parseEther("100"))

            await expect(vePERP.connect(bob).withdraw())
                .to.emit(vePERP, "Withdraw")
                .withArgs(bob.address, parseEther("100"), timestamp + 2)
                .to.emit(vePERP, "Supply")
                .withArgs(parseEther("100"), parseEther("0"))

            await checkPerpBalance()
        })
    })

    describe("admin ownership", async () => {
        it("force error, non-admin call commit transfer ownership", async () => {
            await expect(vePERP.connect(alice).commit_transfer_ownership(alice.address)).to.be.reverted
        })

        it("force error, non-admin call apply transfer ownership", async () => {
            await expect(vePERP.connect(alice).commit_transfer_ownership(alice.address)).to.be.reverted
        })

        it("force error, future admin not set", async () => {
            await expect(vePERP.connect(admin).apply_transfer_ownership()).to.be.reverted
        })

        it("admin transfer ownership", async () => {
            await expect(vePERP.connect(admin).commit_transfer_ownership(alice.address))
                .to.emit(vePERP, "CommitOwnership")
                .withArgs(alice.address)

            expect(await vePERP.future_admin()).to.be.eq(alice.address)

            await expect(vePERP.connect(admin).apply_transfer_ownership())
                .to.emit(vePERP, "ApplyOwnership")
                .withArgs(alice.address)

            expect(await vePERP.admin()).to.be.eq(alice.address)
        })
    })

    describe("recoverERC20", () => {
        const amount = parseUnits("100", 6)
        let mockTestERC20: MockContract<TestERC20>

        beforeEach(async () => {
            const mockTestERC20Factory = await smock.mock<TestERC20__factory>("TestERC20")
            mockTestERC20 = await mockTestERC20Factory.deploy()
            await mockTestERC20.__TestERC20_init("MockTestERC20", "MockTestERC20", 18)

            await mockTestERC20.connect(admin).mint(vePERP.address, amount)
        })

        it("force error, when caller is not admin", async () => {
            await expect(vePERP.connect(alice).recoverERC20(mockTestERC20.address, amount)).to.be.reverted
        })

        it("force error, when token is PERP", async () => {
            await expect(vePERP.connect(admin).recoverERC20(vePERP.address, amount)).to.be.reverted
        })

        it("recover amount when non-standard ERC20", async () => {
            mockTestERC20.transfer.returns(false)

            await vePERP.connect(admin).recoverERC20(mockTestERC20.address, amount)

            const balance = await mockTestERC20.balanceOf(vePERP.address)
            expect(balance).to.be.eq(0)
        })

        it("recover amount when standard ERC20", async () => {
            await vePERP.connect(admin).recoverERC20(mockTestERC20.address, amount)

            const balance = await mockTestERC20.balanceOf(vePERP.address)
            expect(balance).to.be.eq(0)
        })
    })
})
