import SwapRouter from 0xa6850776a94e6551

/// Get accurate swap quote from IncrementFi SwapRouter
/// This uses the actual AMM pricing formula including fees
///
/// @param amountIn - Amount of input token
/// @param tokenInIdentifier - Input token identifier (e.g., "A.1654653399040a61.FlowToken")
/// @param tokenOutIdentifier - Output token identifier (e.g., "A.b19436aae4d94622.FiatToken")
/// @returns Exact output amount accounting for fees and price impact
access(all) fun main(amountIn: UFix64, tokenInIdentifier: String, tokenOutIdentifier: String): UFix64 {
    // Create swap path (direct swap, no intermediaries)
    let path = [tokenInIdentifier, tokenOutIdentifier]

    // Get amounts out using SwapRouter
    // This calculates the exact output including:
    // - 0.3% swap fee
    // - Price impact from AMM formula
    // - Actual pool state
    let amounts = SwapRouter.getAmountsOut(amountIn: amountIn, tokenKeyPath: path)

    // Return the final output amount (last element in array)
    return amounts[amounts.length - 1]
}
