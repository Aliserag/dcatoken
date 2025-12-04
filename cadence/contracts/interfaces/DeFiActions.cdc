import FungibleToken from "FungibleToken"

/// DeFiActions: Core interfaces for composable DeFi operations
///
/// Based on FlowActions framework: https://github.com/onflow/FlowActions
/// Provides standardized interfaces for Sources, Sinks, Swappers, and more
///
access(all) contract DeFiActions {

    /// Quote: Swap execution parameters
    access(all) struct Quote {
        access(all) let expectedAmount: UFix64
        access(all) let minAmount: UFix64
        access(all) let slippageTolerance: UFix64
        access(all) let deadline: UFix64?
        access(all) let data: {String: AnyStruct}

        init(
            expectedAmount: UFix64,
            minAmount: UFix64,
            slippageTolerance: UFix64,
            deadline: UFix64?,
            data: {String: AnyStruct}
        ) {
            self.expectedAmount = expectedAmount
            self.minAmount = minAmount
            self.slippageTolerance = slippageTolerance
            self.deadline = deadline
            self.data = data
        }
    }

    /// ComponentInfo: Metadata for traceability
    access(all) struct ComponentInfo {
        access(all) let type: String
        access(all) let identifier: String
        access(all) let version: String

        init(type: String, identifier: String, version: String) {
            self.type = type
            self.identifier = identifier
            self.version = version
        }
    }

    /// Swapper: Token exchange interface
    ///
    /// Implements atomic token swaps with quote validation
    access(all) resource interface Swapper {
        /// Swap tokens according to quote
        access(all) fun swap(
            inVault: @{FungibleToken.Vault},
            quote: Quote
        ): @{FungibleToken.Vault}

        /// Get estimated quote for swap
        access(all) fun getQuote(
            fromTokenType: Type,
            toTokenType: Type,
            amount: UFix64
        ): Quote

        /// Get swapper info
        access(all) fun getInfo(): ComponentInfo
    }

    /// Source: Token provision interface
    ///
    /// Provides tokens on demand (withdrawals, claims, etc.)
    access(all) resource interface Source {
        /// Withdraw tokens up to specified amount
        access(all) fun withdraw(amount: UFix64): @{FungibleToken.Vault}

        /// Get available balance
        access(all) fun getAvailableBalance(): UFix64

        /// Get source info
        access(all) fun getInfo(): ComponentInfo
    }

    /// Sink: Token acceptance interface
    ///
    /// Accepts tokens within capacity limits (deposits, repayments, etc.)
    access(all) resource interface Sink {
        /// Deposit tokens
        access(all) fun deposit(vault: @{FungibleToken.Vault})

        /// Get current capacity
        access(all) fun getCapacity(): UFix64

        /// Get sink info
        access(all) fun getInfo(): ComponentInfo
    }

    /// PriceOracle: Price data interface
    ///
    /// Provides asset price information
    access(all) resource interface PriceOracle {
        /// Get price for token pair
        access(all) fun getPrice(
            baseToken: Type,
            quoteToken: Type
        ): UFix64

        /// Get oracle info
        access(all) fun getInfo(): ComponentInfo
    }

    /// Flasher: Flash loan interface
    ///
    /// Issues flash loans with callback execution
    access(all) resource interface Flasher {
        /// Execute flash loan with callback
        access(all) fun flashLoan(
            amount: UFix64,
            callback: fun(@{FungibleToken.Vault}): @{FungibleToken.Vault}
        )

        /// Get available flash loan capacity
        access(all) fun getFlashLoanCapacity(): UFix64

        /// Get flasher info
        access(all) fun getInfo(): ComponentInfo
    }

    /// Events for traceability
    access(all) event SwapExecuted(
        swapperType: String,
        fromToken: String,
        toToken: String,
        amountIn: UFix64,
        amountOut: UFix64
    )

    access(all) event SourceWithdrawal(
        sourceType: String,
        tokenType: String,
        amount: UFix64
    )

    access(all) event SinkDeposit(
        sinkType: String,
        tokenType: String,
        amount: UFix64
    )
}
