import { FakeContract, smock } from "@defi-wonderland/smock"
import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { FeeDistributor, SurplusBeneficiary, TestERC20, VePERP } from "../../typechain"

chai.use(solidity)

describe("SurplusBeneficiary spec", () => {
    const [admin, alice] = waffle.provider.getWallets()
    let vePERP: VePERP
    let surplusBeneficiary: SurplusBeneficiary
    let testPERP: TestERC20
    let testUSDC: TestERC20
    let treasury: TestERC20
    let fakeFeeDistributor: FakeContract<FeeDistributor>
    const daoPercentage = 0.42e6 // 42%
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

        // use erc20 contract as a treasury contract
        treasury = await testERC20Factory.deploy()

        const vePERPFactory = await ethers.getContractFactory("vePERP")
        vePERP = (await vePERPFactory.deploy(testPERP.address, "vePERP", "vePERP", "v1")) as VePERP

        fakeFeeDistributor = await smock.fake<FeeDistributor>("FeeDistributor")
        fakeFeeDistributor.token.returns(testUSDC.address)

        const surplusBeneficiaryFactory = await ethers.getContractFactory("SurplusBeneficiary")
        surplusBeneficiary = (await surplusBeneficiaryFactory.deploy(
            testUSDC.address,
            fakeFeeDistributor.address,
            treasury.address,
            daoPercentage,
        )) as SurplusBeneficiary
    })

    describe("# admin function", () => {
        it("force error when setFeeDistributor is not a contract", async () => {
            await expect(surplusBeneficiary.connect(admin).setFeeDistributor(alice.address)).to.be.revertedWith(
                "SB_FDNC",
            )
        })

        it("force error when feeDistributor's token is not match", async () => {
            fakeFeeDistributor.token.returns(alice.address)
            await expect(
                surplusBeneficiary.connect(admin).setFeeDistributor(fakeFeeDistributor.address),
            ).to.be.revertedWith("SB_TNM")
        })

        it("force error when setTreasury to 0x0", async () => {
            await expect(
                surplusBeneficiary.connect(admin).setTreasury(ethers.constants.AddressZero),
            ).to.be.revertedWith("SB_TZ")
        })

        it("force error when setTreasuryPercentage is out of bound", async () => {
            await expect(surplusBeneficiary.connect(admin).setTreasuryPercentage(1e6 + 1)).to.be.revertedWith("SB_TPO")
        })

        it("emit FeeDistributorChanged when admin setFeeDistributor", async () => {
            await expect(surplusBeneficiary.connect(admin).setFeeDistributor(fakeFeeDistributor.address))
                .to.be.emit(surplusBeneficiary, "FeeDistributorChanged")
                .withArgs(fakeFeeDistributor.address, fakeFeeDistributor.address)
        })

        it("emit TreasuryChanged when admin setTreasury", async () => {
            await expect(surplusBeneficiary.connect(admin).setTreasury(treasury.address))
                .to.be.emit(surplusBeneficiary, "TreasuryChanged")
                .withArgs(treasury.address, treasury.address)
        })

        it("emit TreasuryPercentageChanged when admin setTreasuryPercentage", async () => {
            await expect(surplusBeneficiary.connect(admin).setTreasuryPercentage(0.5e6))
                .to.be.emit(surplusBeneficiary, "TreasuryPercentageChanged")
                .withArgs(0.42e6, 0.5e6)
        })
    })

    describe("# dispatch", () => {
        it("force error when token amount is 0", async () => {
            await expect(surplusBeneficiary.dispatch()).to.be.revertedWith("SB_TAZ")
        })

        it("force error when balance > 0 after feeDistributor.burn()", async () => {
            const tokenAmount = parseUnits("100", 6)
            await testUSDC.mint(surplusBeneficiary.address, tokenAmount)

            // set fake feeDistributor (burn() will do nothing)
            fakeFeeDistributor.burn.returns()
            fakeFeeDistributor.token.returns(testUSDC.address)
            await surplusBeneficiary.connect(admin).setFeeDistributor(fakeFeeDistributor.address)

            await expect(surplusBeneficiary.dispatch()).to.be.revertedWith("SB_BNZ")
        })
    })
})
