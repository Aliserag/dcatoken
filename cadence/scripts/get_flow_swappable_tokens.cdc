import "SwapFactory"
import "SwapInterfaces"

/// Query all IncrementFi pools that have FLOW as one of the pair tokens
/// Returns token information for tokens that can be swapped with FLOW
///
/// @returns Array of token details including symbol, address, and pool info
access(all) fun main(): [TokenInfo] {
    let flowTokenIdentifier = "A.0ae53cb6e3f42a79.FlowToken.Vault"
    let tokenInfos: [TokenInfo] = []

    // Get all pairs from SwapFactory
    let allPairInfos = SwapFactory.getAllPairsInfo()

    for pairInfo in allPairInfos {
        let token0 = pairInfo.token0Key.identity
        let token1 = pairInfo.token1Key.identity

        // Check if either token is FLOW
        var targetToken: String? = nil
        var isToken0Flow = false

        if token0 == flowTokenIdentifier {
            targetToken = token1
            isToken0Flow = true
        } else if token1 == flowTokenIdentifier {
            targetToken = token0
            isToken0Flow = false
        }

        // If this pair has FLOW, add the other token to results
        if targetToken != nil {
            let tokenKey = isToken0Flow ? pairInfo.token1Key : pairInfo.token0Key

            // Extract token name from identifier
            // Format: A.{address}.{contract}.{resource}
            let parts = self.splitString(targetToken!, separator: ".")
            let tokenAddress = parts.length > 1 ? parts[1] : ""
            let tokenContract = parts.length > 2 ? parts[2] : ""

            // Determine symbol from contract name
            let symbol = self.getTokenSymbol(tokenContract)

            // Get liquidity info
            let reserve0Str = pairInfo.token0Amount.toString()
            let reserve1Str = pairInfo.token1Amount.toString()

            let flowReserve = isToken0Flow ? reserve0Str : reserve1Str
            let tokenReserve = isToken0Flow ? reserve1Str : reserve0Str

            tokenInfos.append(TokenInfo(
                symbol: symbol,
                tokenAddress: tokenAddress,
                tokenContract: tokenContract,
                tokenIdentifier: targetToken!,
                pairAddress: pairInfo.pairAddr,
                flowReserve: flowReserve,
                tokenReserve: tokenReserve,
                isStable: pairInfo.isStableSwap
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
            // Return first 4 uppercase letters of contract name
            return contractName.slice(from: 0, upTo: 4 < contractName.length ? 4 : contractName.length).toUpper()
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
