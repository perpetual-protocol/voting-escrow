import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseEther } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { TestERC20, VePERP } from "../../typechain"
import { getLatestTimestamp } from "../shared/utilities"

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

        await testPERP.mint(admin.address, parseEther("1000"))
        await testPERP.mint(alice.address, parseEther("1000"))
        await testPERP.mint(bob.address, parseEther("1000"))
        await testPERP.mint(carol.address, parseEther("1000"))

        await testPERP.connect(admin).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(alice).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(bob).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(carol).approve(vePERP.address, parseEther("1000"))
    })

    describe("create lock", async () => {
        it("create lock for 1 week", async () => {
            const CURRENT_TIMESTAMP = 1715817600 // Thu May 16 00:00:00 UTC 2024
            await waffle.provider.send("evm_setNextBlockTimestamp", [CURRENT_TIMESTAMP])

            const lockAmount = parseEther("100")
            await expect(vePERP.connect(alice).create_lock(lockAmount, CURRENT_TIMESTAMP + WEEK))
                .to.changeTokenBalance(testPERP, alice, lockAmount.mul(-1))
                .to.emit(vePERP, "Deposit")
                .withArgs(alice.address, lockAmount, CURRENT_TIMESTAMP + WEEK, 1, CURRENT_TIMESTAMP)
                .to.emit(vePERP, "Supply")
                .withArgs(0, lockAmount)

            const balance = await vePERP["balanceOf(address)"](alice.address)
            expect(balance).to.be.eq(lockAmount.div(YEAR).mul(WEEK).mul(3).add(lockAmount))

            expect(await vePERP.totalPERPSupply()).to.be.eq(lockAmount)
            expect(await vePERP["totalSupply()"]()).to.be.eq(balance)
            expect(await vePERP.supply()).to.be.eq(lockAmount)

            const locked = await vePERP.locked(alice.address)
            expect(locked.amount).to.be.eq(lockAmount)
            expect(locked.end).to.be.eq(CURRENT_TIMESTAMP + WEEK)
        })

        it("create lock for 1 year", async () => {
            const CURRENT_TIMESTAMP = 1717027200 // Thu May 30 00:00:00 UTC 2024
            await waffle.provider.send("evm_setNextBlockTimestamp", [CURRENT_TIMESTAMP])

            const lockAmount = parseEther("100")
            const lockTime = 364 * DAY // 52 weeks
            await expect(vePERP.connect(alice).create_lock(lockAmount, CURRENT_TIMESTAMP + YEAR))
                .to.changeTokenBalance(testPERP, alice, lockAmount.mul(-1))
                .to.emit(vePERP, "Deposit")
                .withArgs(alice.address, lockAmount, CURRENT_TIMESTAMP + lockTime, 1, CURRENT_TIMESTAMP)
                .to.emit(vePERP, "Supply")
                .withArgs(0, lockAmount)

            const balance = await vePERP["balanceOf(address)"](alice.address)
            expect(balance).to.be.eq(lockAmount.div(YEAR).mul(lockTime).mul(3).add(lockAmount))

            expect(await vePERP.totalPERPSupply()).to.be.eq(lockAmount)
            expect(await vePERP["totalSupply()"]()).to.be.eq(balance)
            expect(await vePERP.supply()).to.be.eq(lockAmount)

            const locked = await vePERP.locked(alice.address)
            expect(locked.amount).to.be.eq(lockAmount)
            expect(locked.end).to.be.eq(CURRENT_TIMESTAMP + lockTime)
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
            await expect(vePERP.connect(admin).deposit_for(alice.address, 0)).to.be.reverted
        })

        it("force error, no existing lock", async () => {
            await expect(vePERP.connect(admin).deposit_for(bob.address, 100)).to.be.revertedWith(
                "No existing lock found",
            )
        })

        it("force error, lock is expired", async () => {
            const lastTimestamp = await getLatestTimestamp()
            await waffle.provider.send("evm_setNextBlockTimestamp", [lastTimestamp + 2 * WEEK])

            await expect(vePERP.connect(admin).deposit_for(alice.address, 100)).to.be.revertedWith(
                "Cannot add to expired lock. Withdraw",
            )
        })

        it("deposit for alice", async () => {
            const lastTimestamp = await getLatestTimestamp()
            const oldLock = await vePERP.locked(alice.address)
            await expect(vePERP.connect(admin).deposit_for(alice.address, parseEther("100")))
                .to.changeTokenBalance(testPERP, admin, parseEther("-100"))
                .to.emit(vePERP, "Deposit")
                .withArgs(alice.address, parseEther("100"), oldLock.end, 0, lastTimestamp + 1)
                .to.emit(vePERP, "Supply")
                .withArgs(parseEther("100"), parseEther("200"))

            const newLock = await vePERP.locked(alice.address)
            expect(newLock.amount).to.be.eq(oldLock.amount.add(parseEther("100")))
            expect(newLock.end).to.be.eq(oldLock.end)
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
            await expect(vePERP.connect(alice).increase_unlock_time(oldLock.end.add(WEEK)))
                .to.changeTokenBalance(testPERP, admin, "0")
                .to.emit(vePERP, "Deposit")
                .withArgs(alice.address, "0", oldLock.end.add(WEEK), 3, lastTimestamp + 1)
                .to.emit(vePERP, "Supply")
                .withArgs(parseEther("100"), parseEther("100"))

            const newLock = await vePERP.locked(alice.address)

            expect(newLock.end).to.be.eq(oldLock.end.add(WEEK))
            expect(newLock.amount).to.be.eq(oldLock.amount)
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
            const lastTimestamp = await getLatestTimestamp()

            await expect(vePERP.connect(alice).increase_amount(parseEther("100")))
                .to.changeTokenBalance(testPERP, alice, parseEther("-100"))
                .to.emit(vePERP, "Deposit")
                .withArgs(alice.address, parseEther("100"), oldLock.end, 2, lastTimestamp + 1)
                .to.emit(vePERP, "Supply")
                .withArgs(parseEther("100"), parseEther("200"))

            const newLock = await vePERP.locked(alice.address)

            expect(newLock.end).to.be.eq(oldLock.end)
            expect(newLock.amount).to.be.eq(oldLock.amount.add(parseEther("100")))
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

            await expect(vePERP.connect(alice).withdraw())
                .to.changeTokenBalance(testPERP, alice, parseEther("100"))
                .to.emit(vePERP, "Withdraw")
                .withArgs(alice.address, parseEther("100"), timestamp + 2 * WEEK)
                .to.emit(vePERP, "Supply")
                .withArgs(parseEther("100"), parseEther("0"))

            const newLock = await vePERP.locked(alice.address)

            expect(newLock.amount).to.be.eq(parseEther("0"))
            expect(await testPERP.balanceOf(alice.address)).to.be.eq(parseEther("1000"))
        })
    })

    describe("get voting power and total supply in history epoch", async () => {
        const epoch1Timestamp = 1720051200 // Thu Jul  4 00:00:00 UTC 2024
        const epoch2Timestamp = 1720656000 // Thu Jul 11 00:00:00 UTC 2024
        const epoch3Timestamp = 1721260800 // Thu Jul 18 00:00:00 UTC 2024
        const epoch4Timestamp = 1721865600 // Thu Jul 25 00:00:00 UTC 2024
        const epoch5Timestamp = 1722470400 // Thu Aug 1  00:00:00 UTC 2024
        const epoch6Timestamp = 1723075200 // Thu Aug 8  00:00:00 UTC 2024

        const lockAmount = parseEther("100")
        const slope = lockAmount.div(YEAR)
        let initialized = false

        beforeEach(async () => {
            if (initialized) {
                return
            }
            initialized = true
            // epoch 1
            await waffle.provider.send("evm_setNextBlockTimestamp", [epoch1Timestamp])
            await vePERP.connect(alice).create_lock(lockAmount, epoch1Timestamp + 5 * WEEK)

            await waffle.provider.send("evm_setNextBlockTimestamp", [epoch1Timestamp + 2 * DAY])
            await vePERP.connect(bob).create_lock(lockAmount, epoch1Timestamp + WEEK)

            // epoch 2~3

            // epoch 4
            await waffle.provider.send("evm_setNextBlockTimestamp", [epoch4Timestamp])
            await vePERP.connect(carol).create_lock(lockAmount, epoch4Timestamp + WEEK)
        })

        it("get history voting powers", async () => {
            const balanceEpoch1 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch1Timestamp)
            expect(balanceEpoch1).to.be.eq(lockAmount.add(slope.mul(5 * WEEK).mul(3)))

            const balanceEpoch2 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch2Timestamp)
            expect(balanceEpoch2).to.be.eq(lockAmount.add(slope.mul(4 * WEEK).mul(3)))

            const balanceEpoch3 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch3Timestamp)
            expect(balanceEpoch3).to.be.eq(lockAmount.add(slope.mul(3 * WEEK).mul(3)))

            const balanceEpoch6 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch6Timestamp)
            expect(balanceEpoch6).to.be.eq(lockAmount)
        })

        it("get history total supply", async () => {
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

            const totalSupplyEpoch4 = await vePERP["totalSupply(uint256)"](epoch4Timestamp)
            const aliceBalanceEpoch4 = await vePERP["balanceOf(address,uint256)"](alice.address, epoch4Timestamp)
            const bobBalanceEpoch4 = await vePERP["balanceOf(address,uint256)"](bob.address, epoch4Timestamp)
            const carolBalanceEpoch4 = await vePERP["balanceOf(address,uint256)"](carol.address, epoch4Timestamp)
            expect(totalSupplyEpoch4).to.be.eq(aliceBalanceEpoch4.add(bobBalanceEpoch4).add(carolBalanceEpoch4))
        })

        it("return 0 when timestamp is before epoch 0", async () => {
            const timestampBeforeEpoch1 = epoch1Timestamp - 100
            expect(await vePERP["totalSupply(uint256)"](timestampBeforeEpoch1)).to.be.eq("0")
            expect(await vePERP["balanceOf(address,uint256)"](alice.address, timestampBeforeEpoch1)).to.be.eq("0")
        })
    })
})
