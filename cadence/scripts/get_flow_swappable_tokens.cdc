import SwapFactory from 0xb063c16cac85dbd1
import SwapInterfaces from 0xb78ef7afa52ff906

/// Query all IncrementFi pools that have FLOW as one of the pair tokens
/// Returns token information for tokens that can be swapped with FLOW
///
/// @returns Array of token details including symbol, address, and pool info
access(all) fun main(): [TokenInfo] {
    let flowTokenIdentifier = "A.1654653399040a61.FlowToken"
    let tokenInfos: [TokenInfo] = []

    // Get all pairs from SwapFactory using the correct API
    let pairsCount = SwapFactory.getAllPairsLength()

    if pairsCount == 0 {
        return []
    }

    // Limit to first 50 pairs to avoid potential issues with deprecated/migrated pairs
    let limit: UInt64 = pairsCount > 50 ? 50 : UInt64(pairsCount)

    // Get pair infos - returns array of arrays
    // Each inner array has: [token0Key, token1Key, token0Reserve, token1Reserve, pairAddr, lpSupply, feeBps, isStable, curveP]
    let allPairInfos = SwapFactory.getSlicedPairInfos(from: 0, to: limit - 1)

    for pairInfoRaw in allPairInfos {
        // Cast AnyStruct to array
        // Format: [token0Key, token1Key, token0Reserve, token1Reserve, pairAddr, lpSupply, feeBps, isStable, curveP]
        let pairInfo = pairInfoRaw as! [AnyStruct]

        // Extract fields from array (indexes match the order from SwapFactory)
        let token0 = (pairInfo[0] as! String)
        let token1 = (pairInfo[1] as! String)
        let token0Reserve = (pairInfo[2] as! UFix64)
        let token1Reserve = (pairInfo[3] as! UFix64)
        let pairAddr = (pairInfo[4] as! Address)
        let isStableSwap = (pairInfo[7] as! Bool)

        // Check if either token is FLOW
        var targetToken: String? = nil
        var isToken0Flow = false

        if token0.slice(from: 0, upTo: token0.length).contains(flowTokenIdentifier) {
            targetToken = token1
            isToken0Flow = true
        } else if token1.slice(from: 0, upTo: token1.length).contains(flowTokenIdentifier) {
            targetToken = token0
            isToken0Flow = false
        }

        // If this pair has FLOW, add the other token to results
        if targetToken != nil {
            // Extract token name from identifier
            // Format: A.{address}.{contract} or A.{address}.{contract}.Vault
            let parts = splitString(targetToken!, separator: ".")
            let tokenAddress = parts.length > 1 ? parts[1] : ""
            let tokenContract = parts.length > 2 ? parts[2] : ""

            // Determine symbol from contract name
            let symbol = getTokenSymbol(tokenContract)

            // Get liquidity info
            let flowReserve = isToken0Flow ? token0Reserve.toString() : token1Reserve.toString()
            let tokenReserve = isToken0Flow ? token1Reserve.toString() : token0Reserve.toString()

            tokenInfos.append(TokenInfo(
                symbol: symbol,
                tokenAddress: tokenAddress,
                tokenContract: tokenContract,
                tokenIdentifier: targetToken!,
                pairAddress: pairAddr,
                flowReserve: flowReserve,
                tokenReserve: tokenReserve,
                isStable: isStableSwap
            ))
        }
    }

    return tokenInfos
}

/// Split a string by separator
access(all) fun splitString(_ str: String, separator: String): [String] {
    let parts: [String] = []
    var current = ""
    var i = 0

    while i < str.length {
        let char = str.slice(from: i, upTo: i + 1)
        if char == separator {
            if current.length > 0 {
                parts.append(current)
            }
            current = ""
        } else {
            current = current.concat(char)
        }
        i = i + 1
    }

    if current.length > 0 {
        parts.append(current)
    }

    return parts
}

/// Get human-readable symbol from contract name
access(all) fun getTokenSymbol(_ contractName: String): String {
    // Map common contract names to symbols
    switch contractName {
        case "FlowToken":
            return "FLOW"
        case "FiatToken":
            return "USDC"
        case "TeleportedTetherToken":
            return "USDT"
        case "stFlowToken":
            return "stFLOW"
        case "BeaverToken":
            return "BEAVER"
        case "DucToken":
            return "DUC"
        case "CowToken":
            return "COW"
        default:
            // Return first 4 characters of contract name
            let maxLen = 4 < contractName.length ? 4 : contractName.length
            return contractName.slice(from: 0, upTo: maxLen)
    }
}

/// Token information structure
access(all) struct TokenInfo {
    access(all) let symbol: String
    access(all) let tokenAddress: String
    access(all) let tokenContract: String
    access(all) let tokenIdentifier: String
    access(all) let pairAddress: Address
    access(all) let flowReserve: String
    access(all) let tokenReserve: String
    access(all) let isStable: Bool

    init(
        symbol: String,
        tokenAddress: String,
        tokenContract: String,
        tokenIdentifier: String,
        pairAddress: Address,
        flowReserve: String,
        tokenReserve: String,
        isStable: Bool
    ) {
        self.symbol = symbol
        self.tokenAddress = tokenAddress
        self.tokenContract = tokenContract
        self.tokenIdentifier = tokenIdentifier
        self.pairAddress = pairAddress
        self.flowReserve = flowReserve
        self.tokenReserve = tokenReserve
        self.isStable = isStable
    }
}
