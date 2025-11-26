/// DeFiMath: High-precision DeFi math utilities using 128-bit fixed-point arithmetic
///
/// This contract provides utilities for:
/// - Slippage calculations using basis points (bps)
/// - Weighted average price tracking using FP128
/// - Safe fixed-point arithmetic operations
///
/// Educational Notes:
/// - Basis Points (bps): 1 bps = 0.01%, 100 bps = 1%
/// - Fixed-Point 128: Uses 128-bit integers to represent decimals with high precision
/// - All price calculations maintain precision to avoid rounding errors in DCA
access(all) contract DeFiMath {

    /// Basis points scale: 10000 bps = 100%
    access(all) let BPS_SCALE: UInt64

    /// Fixed-point 128 scale factor (2^64 for 64.64 fixed point representation)
    access(all) let FP128_SCALE: UInt128

    init() {
        self.BPS_SCALE = 10000
        self.FP128_SCALE = 18446744073709551616 // 2^64
    }

    /// Calculate minimum output amount after applying slippage protection
    ///
    /// @param amountIn: The input amount (in native token units)
    /// @param expectedPrice: Expected output per input unit (FP128 format)
    /// @param slippageBps: Maximum acceptable slippage in basis points
    /// @return minAmountOut: Minimum acceptable output amount
    ///
    /// Example:
    /// - amountIn = 10.0 FLOW (10_00000000 in UFix64)
    /// - expectedPrice = 2.5 BEAVER per FLOW (in FP128)
    /// - slippageBps = 100 (1% slippage)
    /// - Result: minAmountOut = 24.75 BEAVER (2.5 * 10 * 0.99)
    access(all) fun calculateMinOutWithSlippage(
        amountIn: UFix64,
        expectedPriceFP128: UInt128,
        slippageBps: UInt64
    ): UFix64 {
        pre {
            slippageBps <= self.BPS_SCALE: "Slippage cannot exceed 100%"
            expectedPriceFP128 > 0: "Expected price must be positive"
        }

        // Calculate expected output in FP128
        let amountInScaled = UInt128(amountIn * 100000000.0) // Convert UFix64 to UInt128 (8 decimals)
        let expectedOutFP128 = (amountInScaled * expectedPriceFP128) / self.FP128_SCALE

        // Apply slippage: minOut = expectedOut * (BPS_SCALE - slippageBps) / BPS_SCALE
        let slippageMultiplier = UInt128(self.BPS_SCALE - slippageBps)
        let minOutFP128 = (expectedOutFP128 * slippageMultiplier) / UInt128(self.BPS_SCALE)

        // Convert back to UFix64 (round down for safety)
        return UFix64(minOutFP128) / 100000000.0
    }

    /// Update weighted average price using new execution data
    ///
    /// Formula: newAvg = (prevAvg * totalPrevIn + executionPrice * newIn) / (totalPrevIn + newIn)
    ///
    /// @param previousAvgPriceFP128: Previous weighted average price (FP128)
    /// @param totalPreviousIn: Total amount previously invested
    /// @param newAmountIn: New investment amount in this execution
    /// @param newAmountOut: Output amount received in this execution
    /// @return Updated weighted average price in FP128 format
    ///
    /// Educational Note:
    /// This calculation maintains a running weighted average of execution prices,
    /// which is crucial for DCA performance tracking. Each purchase is weighted
    /// by the amount invested.
    access(all) fun updateWeightedAveragePriceFP128(
        previousAvgPriceFP128: UInt128,
        totalPreviousIn: UFix64,
        newAmountIn: UFix64,
        newAmountOut: UFix64
    ): UInt128 {
        pre {
            newAmountIn > 0.0: "New amount in must be positive"
            newAmountOut > 0.0: "New amount out must be positive"
        }

        // If this is the first execution, return the execution price directly
        if totalPreviousIn == 0.0 {
            return self.calculatePriceFP128(amountIn: newAmountIn, amountOut: newAmountOut)
        }

        // Calculate new execution price in FP128
        let newPriceFP128 = self.calculatePriceFP128(amountIn: newAmountIn, amountOut: newAmountOut)

        // Convert amounts to UInt128 for high-precision math
        let prevInScaled = UInt128(totalPreviousIn * 100000000.0)
        let newInScaled = UInt128(newAmountIn * 100000000.0)
        let totalInScaled = prevInScaled + newInScaled

        // Weighted average: (prevAvg * prevIn + newPrice * newIn) / totalIn
        let prevWeighted = (previousAvgPriceFP128 * prevInScaled) / self.FP128_SCALE
        let newWeighted = (newPriceFP128 * newInScaled) / self.FP128_SCALE

        return ((prevWeighted + newWeighted) * self.FP128_SCALE) / totalInScaled
    }

    /// Calculate price as output/input in FP128 format
    ///
    /// @param amountIn: Input amount
    /// @param amountOut: Output amount
    /// @return Price in FP128 format (output per unit input)
    access(all) fun calculatePriceFP128(amountIn: UFix64, amountOut: UFix64): UInt128 {
        pre {
            amountIn > 0.0: "Amount in must be positive"
            amountOut > 0.0: "Amount out must be positive"
        }

        // Price = amountOut / amountIn, scaled to FP128
        let amountInScaled = UInt128(amountIn * 100000000.0)
        let amountOutScaled = UInt128(amountOut * 100000000.0)

        return (amountOutScaled * self.FP128_SCALE) / amountInScaled
    }

    /// Convert FP128 price to human-readable UFix64
    ///
    /// @param priceFP128: Price in FP128 format
    /// @return Price as UFix64 for display purposes
    ///
    /// Note: This is for display/logging only. Use FP128 for all calculations.
    access(all) fun fp128ToUFix64(priceFP128: UInt128): UFix64 {
        // Divide by FP128_SCALE and convert to UFix64
        let scaled = priceFP128 / (self.FP128_SCALE / 100000000)
        return UFix64(scaled) / 100000000.0
    }

    /// Validate slippage basis points are within acceptable range
    ///
    /// @param slippageBps: Slippage in basis points
    /// @return true if valid, false otherwise
    access(all) view fun isValidSlippage(slippageBps: UInt64): Bool {
        // Typically DCA should use 0.1% - 5% slippage (10 - 500 bps)
        // But we allow up to 100% for flexibility
        return slippageBps <= self.BPS_SCALE
    }
}
