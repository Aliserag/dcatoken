/// Test script to explore IncrementFi SwapFactory API on mainnet
/// This will help us understand the exact data structure returned
import SwapFactory from 0xb063c16cac85dbd1
import SwapInterfaces from 0xb78ef7afa52ff906

access(all) fun main(): [AnyStruct] {
    // Get total number of pairs
    let pairsCount = SwapFactory.getAllPairsLength()
    log("Total pairs: ".concat(pairsCount.toString()))

    // Get first 3 pairs to understand the structure
    let limit: UInt64 = pairsCount >= 3 ? 3 : UInt64(pairsCount)

    if limit == 0 {
        return []
    }

    // This returns an array where each element is itself an array of pair info
    let pairInfos = SwapFactory.getSlicedPairInfos(from: 0, to: limit - 1)

    log("Fetched pair infos count: ".concat(pairInfos.length.toString()))

    return pairInfos
}
