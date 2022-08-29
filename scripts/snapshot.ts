import { BigNumber, ethers } from "ethers"
import { IERC20, IERC20__factory, VePERP, VePERP__factory } from "../typechain"

// Circulating supply =
//      total supply
//    - Mainnet lock balance
//    - Optimism lock balance
//    - VePERP underlying balance
//    + VePERP weighted balance

const MAINNET_WEB3_ENDPOINT = process.env["MAINNET_WEB3_ENDPOINT"]
const OPTIMISM_WEB3_ENDPOINT = process.env["OPTIMISM_WEB3_ENDPOINT"]

const MAINNET_PERP_ADDRESS = "0xbc396689893d065f41bc2c6ecbee5e0085233447"
const OPTIMISM_PERP_ADDRESS = "0x9e1028F5F1D5eDE59748FFceE5532509976840E0"
const VEPERP_ADDRESS = "0xD360B73b19Fb20aC874633553Fb1007e9FcB2b78"

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

async function getLockBalance(excludeAddress: Array<string>, perp: IERC20): Promise<BigNumber> {
    let totalLockBalance = BigNumber.from(0)

    for (const address of excludeAddress) {
        const balance = await perp.balanceOf(address)
        totalLockBalance = totalLockBalance.add(balance)
    }

    return totalLockBalance
}

async function getVePERPBalance(vePERP: VePERP): Promise<BigNumber> {
    const weightedTotalBalance = await vePERP["totalSupplyWeighted()"]()
    const underlyingBalance = await vePERP.supply()
    return weightedTotalBalance.sub(underlyingBalance)
}

function formatEther(balance: BigNumber): string {
    const number = Number(ethers.utils.formatEther(balance))
    return number.toLocaleString("en-US")
}

async function main(): Promise<void> {
    const mainnetProvider = new ethers.providers.JsonRpcProvider(MAINNET_WEB3_ENDPOINT)
    const optimismProvider = new ethers.providers.JsonRpcProvider(OPTIMISM_WEB3_ENDPOINT)

    const mainnetPERP = new ethers.Contract(MAINNET_PERP_ADDRESS, IERC20__factory.abi, mainnetProvider) as IERC20
    const optimismPERP = new ethers.Contract(OPTIMISM_PERP_ADDRESS, IERC20__factory.abi, optimismProvider) as IERC20
    const optimismVePERP = new ethers.Contract(VEPERP_ADDRESS, VePERP__factory.abi, optimismProvider) as VePERP

    const date = new Date()
    const mainnetBlockNumber = await mainnetProvider.getBlockNumber()
    const optimismBlockNumber = await optimismProvider.getBlockNumber()
    const totalSupply = await mainnetPERP.totalSupply()
    const mainnetLockBalance = await getLockBalance(excludeAddress.mainnet, mainnetPERP)
    const optimismLockBalance = await getLockBalance(excludeAddress.optimism, optimismPERP)
    const optimismVePERPBalance = await getVePERPBalance(optimismVePERP)
    const circulatingBalance = totalSupply.sub(optimismLockBalance).sub(mainnetLockBalance).add(optimismVePERPBalance)

    console.log(`Run script at:`)
    console.log(`- ${date.toUTCString()}`)
    console.log(`- UTC timestamp: ${date.getTime()}`)
    console.log(`- Mainnet block number: ${mainnetBlockNumber}`)
    console.log(`- Optimism block number: ${optimismBlockNumber}`)
    console.log(`-- TotalSupply: ${formatEther(totalSupply)}`)
    console.log(`-- MainnetLockBalance: ${formatEther(mainnetLockBalance)}`)
    console.log(`-- OptimismLockBalance: ${formatEther(optimismLockBalance)}`)
    console.log(`-- OptimismVePERPBalance: ${formatEther(optimismVePERPBalance)}`)
    console.log(`-- Circulating supply: ${formatEther(circulatingBalance)}`)
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error)
            process.exit(1)
        })
}
