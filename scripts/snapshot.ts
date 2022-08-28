import { BigNumber, ethers } from "ethers"
import { IERC20, IERC20__factory, VePERP, VePERP__factory } from "../typechain"

// Circulating supply =
//      total supply
//    - Mainnet lock balance
//    - Optimism lock balance
//    - VePERP underlying balance
//    + VePERP weighted balance

const MAINNET_WEB3_ENDPOINT = process.env["MAINNET_WEB3_ENDPOINT"]
const MAINNET_PERP_ADDRESS = "0xbc396689893d065f41bc2c6ecbee5e0085233447"

const OPTIMISM_WEB3_ENDPOINT = process.env["OPTIMISM_WEB3_ENDPOINT"]
const OPTIMISM_PERP_ADDRESS = "0x9e1028F5F1D5eDE59748FFceE5532509976840E0"

const VEPERP_ADDRESS = "0xD360B73b19Fb20aC874633553Fb1007e9FcB2b78"

const mainnetPERP = new ethers.Contract(
    MAINNET_PERP_ADDRESS,
    IERC20__factory.abi,
    new ethers.providers.JsonRpcProvider(MAINNET_WEB3_ENDPOINT),
) as IERC20

const optimismPERP = new ethers.Contract(
    OPTIMISM_PERP_ADDRESS,
    IERC20__factory.abi,
    new ethers.providers.JsonRpcProvider(OPTIMISM_WEB3_ENDPOINT),
) as IERC20

const optimismVePERP = new ethers.Contract(
    VEPERP_ADDRESS,
    VePERP__factory.abi,
    new ethers.providers.JsonRpcProvider(OPTIMISM_WEB3_ENDPOINT),
) as VePERP

const excludeAddress = {
    mainnet: [
        "0xc49f76a596d6200e4f08f8931d15b69dd1f8033e", // Ecosystem & Rewards + Investor + Team Locked
        "0xD374225abB84DCA94e121F0B8A06B93E39aD7a99", // DAO Treasury
        "0x9FE5f5bbbD3f2172Fa370068D26185f3d82ed9aC", // Tx Mining and Staking Rewards
    ],
    optimism: [
        "0xDcf664d0f76E99eaA2DBD569474d0E75dC899FCD", // Referral reward
        "0x5A06D52F38965904CF15c3f55286263AB9A237d7", // DAO treasury
    ],
}

async function getOptimismLockBalance(): Promise<BigNumber> {
    let optimismTotalLockBalance = BigNumber.from(0)

    for (const address of excludeAddress.optimism) {
        const balance = await optimismPERP.balanceOf(address)
        optimismTotalLockBalance = optimismTotalLockBalance.add(balance)
    }

    return optimismTotalLockBalance
}

async function getMainnetLockBalance(): Promise<BigNumber> {
    let mainnetTotalLockBalance = BigNumber.from(0)

    for (const address of excludeAddress.mainnet) {
        const balance = await mainnetPERP.balanceOf(address)
        mainnetTotalLockBalance = mainnetTotalLockBalance.add(balance)
    }

    return mainnetTotalLockBalance
}

async function getPERPTotalSupply(): Promise<BigNumber> {
    const totalSupply = await mainnetPERP.totalSupply()
    return totalSupply
}

async function getVePERPBalance(): Promise<BigNumber> {
    const weightedTotalBalance = await optimismVePERP["totalSupplyWeighted()"]()
    const underlyingBalance = await optimismVePERP.supply()
    return weightedTotalBalance.sub(underlyingBalance)
}

function formatEther(balance: BigNumber): string {
    const number = Number(ethers.utils.formatEther(balance))
    return number.toLocaleString("en-US")
}

async function main(): Promise<void> {
    const totalSupply = await getPERPTotalSupply()
    const optimismLockBalance = await getOptimismLockBalance()
    const mainnetLockBalance = await getMainnetLockBalance()
    const vePERPBalance = await getVePERPBalance()
    const circulatingBalance = totalSupply.sub(optimismLockBalance).sub(mainnetLockBalance).add(vePERPBalance)

    console.log(`TotalSupply: ${formatEther(totalSupply)}`)
    console.log(`OptimismLockBalance: ${formatEther(optimismLockBalance)}`)
    console.log(`MainnetLockBalance: ${formatEther(mainnetLockBalance)}`)
    console.log(`VePERPBalance: ${formatEther(vePERPBalance)}`)
    console.log(`Circulating supply: ${formatEther(circulatingBalance)}`)
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error)
            process.exit(1)
        })
}
