import { ethers } from "hardhat"
import { VeFXS } from "../../../typechain"

describe("test vePERP", async() => {
    it("deploy vePERP", async() => {
        const testPERPFactory = await ethers.getContractFactory("TestERC20")
        const testPERP = await testPERPFactory.deploy()
        await testPERP.__TestERC20_init("PERP", "PERP", 18)

        const veFXSFactory = await ethers.getContractFactory("veFXS")
        const veFXS = await veFXSFactory.deploy(testPERP.address, "vePERP", "vePERP", "v1") as VeFXS
        console.log(await veFXS.admin())
    })
})
