import { expect } from "chai"
import { parseEther } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { TestERC20, VePERP } from "../../typechain"
import { getLatestTimestamp } from "../shared/utilities"

describe("vePERP", () => {
    const [admin, alice, bob] = waffle.provider.getWallets()
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
        await testPERP.mint(admin.address, parseEther("1000"))
        await testPERP.connect(alice).approve(vePERP.address, parseEther("1000"))
        await testPERP.connect(admin).approve(vePERP.address, parseEther("1000"))
    })

    describe("create lock", async () => {
        it("create lock for 1 week", async () => {
            const CURRENT_TIMESTAMP = 1715817600 // Thu May 16 00:00:00 UTC 2024
            await waffle.provider.send("evm_setNextBlockTimestamp", [CURRENT_TIMESTAMP])

            const lockAmount = parseEther("100")
            await vePERP.connect(alice).create_lock(lockAmount, CURRENT_TIMESTAMP + WEEK)

            const balance = await vePERP["balanceOf(address)"](alice.address)
            expect(balance).to.be.eq(lockAmount.div(YEAR).mul(WEEK).mul(3).add(lockAmount))

            expect(await vePERP.totalPERPSupply()).to.be.eq(lockAmount)
            expect(await vePERP["totalSupply()"]()).to.be.eq(balance)

            const locked = await vePERP.locked(alice.address)
            expect(locked.amount).to.be.eq(lockAmount)
            expect(locked.end).to.be.eq(CURRENT_TIMESTAMP + WEEK)
        })

        it("create lock for 1 year", async () => {
            const CURRENT_TIMESTAMP = 1717027200 // Thu May 30 00:00:00 UTC 2024
            await waffle.provider.send("evm_setNextBlockTimestamp", [CURRENT_TIMESTAMP])

            const lockAmount = parseEther("100")
            await vePERP.connect(alice).create_lock(lockAmount, CURRENT_TIMESTAMP + YEAR)

            const lockTime = 364 * DAY // 52 weeks
            const balance = await vePERP["balanceOf(address)"](alice.address)
            expect(balance).to.be.eq(lockAmount.div(YEAR).mul(lockTime).mul(3).add(lockAmount))

            expect(await vePERP.totalPERPSupply()).to.be.eq(lockAmount)
            expect(await vePERP["totalSupply()"]()).to.be.eq(balance)

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
            const oldLock = await vePERP.locked(alice.address)
            await vePERP.connect(admin).deposit_for(alice.address, parseEther("100"))

            const newLock = await vePERP.locked(alice.address)
            expect(newLock.amount).to.be.eq(oldLock.amount.add(parseEther("100")))
            expect(newLock.end).to.be.eq(oldLock.end)
        })
    })

    describe("increase unlock time", async () => {
        let lastTimestamp: number

        beforeEach(async () => {
            const lastTimestamp = await getLatestTimestamp()
            await vePERP.connect(alice).create_lock(parseEther("100"), lastTimestamp + WEEK)
        })

        it("increase unlock time for another 1 week", async () => {
            const oldLock = await vePERP.locked(alice.address)

            // increase unlock time for 1 week
            await vePERP.connect(alice).increase_unlock_time(oldLock.end.add(WEEK))
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

            await vePERP.connect(alice).increase_amount(parseEther("100"))

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
            await waffle.provider.send("evm_mine", [])

            await vePERP.connect(alice).withdraw()

            const newLock = await vePERP.locked(alice.address)

            expect(newLock.amount).to.be.eq(parseEther("0"))
            expect(await testPERP.balanceOf(alice.address)).to.be.eq(parseEther("1000"))
        })
    })
})
