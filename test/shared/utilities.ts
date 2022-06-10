import { LogDescription } from "@ethersproject/abi"
import { TransactionReceipt } from "@ethersproject/abstract-provider"
import bn from "bignumber.js"
import { BaseContract, BigNumber } from "ethers"
import { waffle } from "hardhat"

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

function bigNumberToBig(val: BigNumber, decimals: number = 18): bn {
    return new bn(val.toString()).div(new bn(10).pow(decimals))
}

export function filterLogs(receipt: TransactionReceipt, topic: string, baseContract: BaseContract): LogDescription[] {
    return receipt.logs.filter(log => log.topics[0] === topic).map(log => baseContract.interface.parseLog(log))
}

export async function getLatestTimestamp(): Promise<number> {
    return (await waffle.provider.getBlock("latest")).timestamp
}

export function getWeekTimestamp(t: number, roundDown = true): number {
    const WEEK = 3600 * 24 * 7 // week in seconds
    return roundDown
      ? Math.floor(t / WEEK) * WEEK
      : Math.ceil(t / WEEK) * WEEK
}
