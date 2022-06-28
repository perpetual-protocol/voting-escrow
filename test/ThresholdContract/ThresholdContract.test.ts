import { MockContract, smock } from "@defi-wonderland/smock"
import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { FeeDistributor, TestERC20, TestInsuranceFund__factory, ThresholdContract, VePERP } from "../../typechain"
import { TestInsuranceFund } from "../../typechain/TestInsuranceFund"
import { getLatestTimestamp } from "../shared/utilities"

chai.use(solidity)

describe("ThresholdContract", () => {
    const [admin, alice] = waffle.provider.getWallets()
    let vePERP: VePERP
    let feeDistributor: FeeDistributor
    let thresholdContract: ThresholdContract
    let mockTestInsuranceFund: MockContract<TestInsuranceFund>
    let testPERP: TestERC20
    let testUSDC: TestERC20
    let dao: TestERC20
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

        // use erc20 contract as a dao contract
        dao = await testERC20Factory.deploy()

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

        const mockTestInsuranceFundFactory = await smock.mock<TestInsuranceFund__factory>("TestInsuranceFund")
        mockTestInsuranceFund = await mockTestInsuranceFundFactory.deploy(testUSDC.address)

        const thresholdContractFactory = await ethers.getContractFactory("ThresholdContract")
        thresholdContract = (await thresholdContractFactory.deploy()) as ThresholdContract
        await thresholdContract.initialize(
            mockTestInsuranceFund.address,
            feeDistributor.address,
            dao.address,
            daoPercentage,
        )
    })

    describe("# admin function", () => {
        it("force error when setInsuranceFund is not a contract", async () => {
            await expect(thresholdContract.connect(admin).setInsuranceFund(alice.address)).to.be.revertedWith("TC_INC")
        })

        it("force error when setFeeDistributor is not a contract", async () => {
            await expect(thresholdContract.connect(admin).setFeeDistributor(alice.address)).to.be.revertedWith(
                "TC_FDNC",
            )
        })

        it("force error when setDao is not a contract", async () => {
            await expect(thresholdContract.connect(admin).setDao(alice.address)).to.be.revertedWith("TC_DNC")
        })

        it("force error when setDaoPercentage is zero", async () => {
            await expect(thresholdContract.connect(admin).setDaoPercentage(0)).to.be.revertedWith("TC_DPZ")
        })

        it("emit InsuranceFundChanged when admin setInsuranceFund", async () => {
            await expect(thresholdContract.connect(admin).setInsuranceFund(mockTestInsuranceFund.address))
                .to.be.emit(thresholdContract, "InsuranceFundChanged")
                .withArgs(mockTestInsuranceFund.address, mockTestInsuranceFund.address)
        })

        it("emit FeeDistributorChanged when admin setFeeDistributor", async () => {
            await expect(thresholdContract.connect(admin).setFeeDistributor(feeDistributor.address))
                .to.be.emit(thresholdContract, "FeeDistributorChanged")
                .withArgs(feeDistributor.address, feeDistributor.address)
        })

        it("emit DaoChanged when admin setDao", async () => {
            await expect(thresholdContract.connect(admin).setDao(dao.address))
                .to.be.emit(thresholdContract, "DaoChanged")
                .withArgs(dao.address, dao.address)
        })

        it("emit DaoPercentageChanged when admin setDaoPercentage", async () => {
            await expect(thresholdContract.connect(admin).setDaoPercentage(0.5e6))
                .to.be.emit(thresholdContract, "DaoPercentageChanged")
                .withArgs(0.42e6, 0.5e6)
        })
    })

    describe("# feeDistribute", () => {
        it("force error when insurance.distributeFee() returns 0", async () => {
            await expect(thresholdContract.feeDistribute()).to.be.revertedWith("TC_FZ")
        })

        it("force error when balance > 0 after feeDistributor.burn()", async () => {
            const fee = parseUnits("100", 6)
            await testUSDC.mint(mockTestInsuranceFund.address, fee)

            // set fake feeDistributor (burn() will do nothing)
            const fakeFeeDistributor = await smock.fake<FeeDistributor>("FeeDistributor")
            fakeFeeDistributor.burn.returns()
            await thresholdContract.connect(admin).setFeeDistributor(fakeFeeDistributor.address)

            await expect(thresholdContract.feeDistribute()).to.be.revertedWith("TC_BNZ")
        })

        it("emit FeeDistribute event when feeDistribute", async () => {
            const fee = parseUnits("100", 6)
            const feeToDao = fee.mul(daoPercentage).div(1e6)
            const feeToFeeDistributor = fee.sub(feeToDao)

            await testUSDC.mint(mockTestInsuranceFund.address, fee)

            await expect(thresholdContract.feeDistribute())
                .to.be.emit(thresholdContract, "FeeDistribute")
                .withArgs(feeToDao, feeToFeeDistributor)

            const balanceOfDao = await testUSDC.balanceOf(dao.address)
            const balanceOfFeeDistributor = await testUSDC.balanceOf(feeDistributor.address)

            expect(balanceOfDao).to.be.eq(feeToDao)
            expect(balanceOfFeeDistributor).to.be.eq(feeToFeeDistributor)
        })
    })
})
