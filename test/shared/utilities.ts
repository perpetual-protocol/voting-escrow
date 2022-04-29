import { LogDescription } from "@ethersproject/abi"
import { TransactionReceipt } from "@ethersproject/abstract-provider"
import bn from "bignumber.js"
import { BaseContract, BigNumber } from "ethers"

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

function bigNumberToBig(val: BigNumber, decimals: number = 18): bn {
    return new bn(val.toString()).div(new bn(10).pow(decimals))
}

export function filterLogs(receipt: TransactionReceipt, topic: string, baseContract: BaseContract): LogDescription[] {
    return receipt.logs.filter(log => log.topics[0] === topic).map(log => baseContract.interface.parseLog(log))
}
