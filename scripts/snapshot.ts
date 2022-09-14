import * as dotenv from "dotenv"
import EthDater from "ethereum-block-by-date"
import { BigNumber, ethers } from "ethers"
import { IERC20, IERC20__factory, VePERP, VePERP__factory } from "../typechain"

dotenv.config()

// following the Perp V2 Tokenomics proposal https://gov.perp.fi/t/proposal-perp-v2-tokenomics/642
//   1. Take the total amount of voting power, which is the sum of circulating PERP and vePERP
//   2. Introduce a minimum quorum requirement of 10% of the total voting power calculated in (1)

// Sum of circulating voting power =
//      PERP total supply
//    - Mainnet locked
//    - Optimism locked
//    + vePERP weighted balance
//    - vePERP underlying balance ( exclude double count )

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
        "0xDcf664d0f76E99eaA2DBD569474d0E75dC899FCD", // Tx Mining and Staking Rewards
        "0x5A06D52F38965904CF15c3f55286263AB9A237d7", // DAO treasury
    ],
}

async function getLockBalance(excludeAddress: Array<string>, perp: IERC20, blockNumber: number): Promise<BigNumber> {
    let totalLockBalance = BigNumber.from(0)

    for (const address of excludeAddress) {
        const balance = await perp.balanceOf(address, { blockTag: blockNumber })
        totalLockBalance = totalLockBalance.add(balance)
    }

    return totalLockBalance
}

async function getWeightedTotalVotingPower(vePERP: VePERP, blockNumber: number): Promise<BigNumber> {
    return await vePERP["totalSupplyWeighted()"]({ blockTag: blockNumber })
}

async function getTotalPERPSupply(vePERP: VePERP, blockNumber: number): Promise<BigNumber> {
    return await vePERP.totalPERPSupply({ blockTag: blockNumber })
}

function formatEther(balance: BigNumber): string {
    const number = Number(ethers.utils.formatEther(balance))
    return number.toLocaleString("en-US")
}

async function main(): Promise<void> {
    const specificTimestamp = process.argv[2]

    const mainnetProvider = new ethers.providers.JsonRpcProvider(MAINNET_WEB3_ENDPOINT)
    const optimismProvider = new ethers.providers.JsonRpcProvider(OPTIMISM_WEB3_ENDPOINT)

    const mainnetEthDater = new EthDater(mainnetProvider)
    const optimismEthDater = new EthDater(optimismProvider)

    const mainnetPERP = new ethers.Contract(MAINNET_PERP_ADDRESS, IERC20__factory.abi, mainnetProvider) as IERC20
    const optimismPERP = new ethers.Contract(OPTIMISM_PERP_ADDRESS, IERC20__factory.abi, optimismProvider) as IERC20
    const optimismVePERP = new ethers.Contract(VEPERP_ADDRESS, VePERP__factory.abi, optimismProvider) as VePERP

    const date = specificTimestamp ? new Date(Number(specificTimestamp) * 1000) : new Date()
    const mainnetBlockNumber = (await mainnetEthDater.getDate(date)).block
    const mainnetTimestamp = (await mainnetProvider.getBlock(mainnetBlockNumber)).timestamp
    const mainnetDate = new Date(mainnetTimestamp * 1000)
    const optimismBlockNumber = (await optimismEthDater.getDate(date)).block
    const optimismTimestamp = (await optimismProvider.getBlock(optimismBlockNumber)).timestamp
    const optimismDate = new Date(optimismTimestamp * 1000)
    const totalSupply = await mainnetPERP.totalSupply({ blockTag: mainnetBlockNumber })
    const mainnetLockBalance = await getLockBalance(excludeAddress.mainnet, mainnetPERP, mainnetBlockNumber)
    const optimismLockBalance = await getLockBalance(excludeAddress.optimism, optimismPERP, optimismBlockNumber)
    const optimismWeightedVotingPower = await getWeightedTotalVotingPower(optimismVePERP, optimismBlockNumber)
    const optimismPerpInVePerp = await getTotalPERPSupply(optimismVePERP, optimismBlockNumber)
    const perpCirculatingSupply = totalSupply.sub(optimismLockBalance).sub(mainnetLockBalance)
    const circulatingVotingPower = perpCirculatingSupply.add(optimismWeightedVotingPower).sub(optimismPerpInVePerp)

    console.log(`Query timestamp:`)
    console.log(`- ${date.toUTCString()}`)
    console.log(`- UTC timestamp: ${date.getTime()}`)

    console.log(`- Mainnet block number: ${mainnetBlockNumber}`)
    console.log(`- Mainnet timestamp: ${mainnetDate.getTime() / 1000}`) // show timestamp in seconds
    console.log(`- Mainnet UTC: ${mainnetDate.toUTCString()}`)

    console.log(`- Optimism block number: ${optimismBlockNumber}`)
    console.log(`- Optimism timestamp: ${optimismDate.getTime() / 1000}`) // show timestamp in seconds
    console.log(`- Optimism UTC: ${optimismDate.toUTCString()}`)

    console.log(`- Circulating Supply: ${formatEther(perpCirculatingSupply)}`)
    console.log(`- Circulating Voting Power: ${formatEther(circulatingVotingPower)}`)
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error)
            process.exit(1)
        })
}
