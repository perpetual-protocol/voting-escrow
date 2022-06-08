import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseEther } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { TestERC20, VePERP } from "../../typechain"
import {getLatestTimestamp, getWeekTimestamp} from "../shared/utilities"

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
            expect(balance).to.be.eq(lockAmount.div(YEAR).mul(WEEK).mul(3).add(lockAmount))

            expect(await vePERP.totalPERPSupply()).to.be.eq(lockAmount)
            expect(await vePERP["totalSupply()"]()).to.be.eq(balance)
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

            const balance = await vePERP["balanceOf(address)"](alice.address)
            expect(balance).to.be.eq(lockAmount.div(YEAR).mul(lockTime).mul(3).add(lockAmount))

            expect(await vePERP.totalPERPSupply()).to.be.eq(lockAmount)
            expect(await vePERP["totalSupply()"]()).to.be.eq(balance)
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
        let epoch1Timestamp
        let epoch2Timestamp
        let epoch3Timestamp
        let epoch4Timestamp
        let epoch5Timestamp
        let epoch6Timestamp
        let epoch7Timestamp

        const lockAmount = parseEther("100")
        const slope = lockAmount.div(YEAR)

        beforeEach(async () => {
            const startWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            epoch1Timestamp = startWeekTimestamp + WEEK
            epoch2Timestamp = startWeekTimestamp + WEEK * 2
            epoch3Timestamp = startWeekTimestamp + WEEK * 3
            epoch4Timestamp = startWeekTimestamp + WEEK * 4
            epoch5Timestamp = startWeekTimestamp + WEEK * 5
            epoch6Timestamp = startWeekTimestamp + WEEK * 6
            epoch7Timestamp = startWeekTimestamp + WEEK * 7

            // epoch 1
            await waffle.provider.send("evm_setNextBlockTimestamp", [epoch1Timestamp])
            await vePERP.connect(alice).create_lock(lockAmount, epoch1Timestamp + 5 * WEEK)

            await waffle.provider.send("evm_setNextBlockTimestamp", [epoch1Timestamp + 2 * DAY])
            await vePERP.connect(bob).create_lock(lockAmount, epoch1Timestamp + WEEK)

            // epoch 2~3

            // epoch 4
            await waffle.provider.send("evm_setNextBlockTimestamp", [epoch4Timestamp])
            await vePERP.connect(carol).create_lock(lockAmount, epoch4Timestamp + WEEK)

            // epoch 5
            await waffle.provider.send("evm_setNextBlockTimestamp", [epoch5Timestamp])
            // alice original expired at epoch6, new expire time will be epoch7
            await vePERP.connect(alice).increase_unlock_time(epoch5Timestamp + 2 * WEEK)
        })

        it("get history voting powers & total supply", async () => {
            // assume current time is epoch5

            // get historical data
            const balanceEpoch1 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch1Timestamp)
            expect(balanceEpoch1).to.be.eq(lockAmount.add(slope.mul(5 * WEEK).mul(3)))

            const balanceEpoch2 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch2Timestamp)
            expect(balanceEpoch2).to.be.eq(lockAmount.add(slope.mul(4 * WEEK).mul(3)))

            const balanceEpoch3 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch3Timestamp)
            expect(balanceEpoch3).to.be.eq(lockAmount.add(slope.mul(3 * WEEK).mul(3)))

            const balanceEpoch3Unweighted = await vePERP["balanceOfUnweighted(address,uint256)"](
                alice.address,
                epoch3Timestamp,
            )
            expect(balanceEpoch3Unweighted).to.be.eq(slope.mul(3 * WEEK))

            const balanceEpoch5 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch5Timestamp)
            expect(balanceEpoch5).to.be.eq(lockAmount.add(slope.mul(2 * WEEK).mul(3)))

            // get future data
            const balanceEpoch6 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch6Timestamp)
            expect(balanceEpoch6).to.be.eq(lockAmount.add(slope.mul(1 * WEEK).mul(3)))

            // alice's lock is expired
            const balanceEpoch7 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch7Timestamp)
            expect(balanceEpoch7).to.be.eq(lockAmount)

            const balanceEpoch7Unweighted = await vePERP["balanceOfUnweighted(address,uint256)"](
                alice.address,
                epoch7Timestamp,
            )
            expect(balanceEpoch7Unweighted).to.be.eq("0")

            // get history total supply
            const totalSupplyEpoch1 = await vePERP["totalSupply(uint256)"](epoch1Timestamp)
            expect(totalSupplyEpoch1).to.be.eq(
                await vePERP["balanceOf(address,uint256)"](alice.address, epoch1Timestamp),
            )

            const totalSupplyEpoch2 = await vePERP["totalSupply(uint256)"](epoch2Timestamp)
            const aliceBalanceEpoch2 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch2Timestamp)
            const bobBalanceEpoch2 = await vePERP["balanceOf(address,uint256)"](bob.address, epoch2Timestamp)
            expect(totalSupplyEpoch2).to.be.eq(aliceBalanceEpoch2.add(bobBalanceEpoch2))

            const totalSupplyEpoch3 = await vePERP["totalSupply(uint256)"](epoch3Timestamp)
            const aliceBalanceEpoch3 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch3Timestamp)
            const bobBalanceEpoch3 = await vePERP["balanceOf(address,uint256)"](bob.address, epoch3Timestamp)
            expect(totalSupplyEpoch3).to.be.eq(aliceBalanceEpoch3.add(bobBalanceEpoch3))

            const totalSupplyUnweightedEpoch3 = await vePERP["totalSupplyUnweighted(uint256)"](epoch3Timestamp)
            const aliceBalanceUnweightedEpoch3 = await vePERP["balanceOfUnweighted(address,uint256)"](
                alice.address,
                epoch3Timestamp,
            )
            const bobBalanceUnweightedEpoch3 = await vePERP["balanceOfUnweighted(address,uint256)"](
                bob.address,
                epoch3Timestamp,
            )
            expect(totalSupplyUnweightedEpoch3).to.be.eq(aliceBalanceUnweightedEpoch3.add(bobBalanceUnweightedEpoch3))

            const totalSupplyEpoch4 = await vePERP["totalSupply(uint256)"](epoch4Timestamp)
            const aliceBalanceEpoch4 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch4Timestamp)
            const bobBalanceEpoch4 = await vePERP["balanceOf(address,uint256)"](bob.address, epoch4Timestamp)
            const carolBalanceEpoch4 = await vePERP["balanceOf(address,uint256)"](carol.address, epoch4Timestamp)
            expect(totalSupplyEpoch4).to.be.eq(aliceBalanceEpoch4.add(bobBalanceEpoch4).add(carolBalanceEpoch4))

            // get future total supply

            const totalSupplyEpoch7 = await vePERP["totalSupply(uint256)"](epoch7Timestamp)
            // sum of alice & bob & carol's lock amount
            expect(totalSupplyEpoch7).to.be.eq(lockAmount.mul(3))

            const totalSupplyUnweightedEpoch7 = await vePERP["totalSupplyUnweighted(uint256)"](epoch7Timestamp)
            expect(totalSupplyUnweightedEpoch7).to.be.eq("0")

            // return 0 when timestamp is before epoch 0
            const timestampBeforeEpoch1 = epoch1Timestamp - 100
            expect(await vePERP["totalSupply(uint256)"](timestampBeforeEpoch1)).to.be.eq("0")
            expect(await vePERP["balanceOf(address,uint256)"](alice.address, timestampBeforeEpoch1)).to.be.eq("0")

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
})
