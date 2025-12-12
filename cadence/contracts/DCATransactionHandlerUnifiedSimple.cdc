import "FlowTransactionScheduler"
import "DCAControllerUnified"
import "DCAPlanUnified"
import "DeFiMath"
import "FungibleToken"
import "FlowToken"
import "SwapRouter"
import "EVM"
import "DeFiActions"
import "UniswapV3SwapperConnector"
import EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14 from 0x1e4aa0b87d10b141

/// DCATransactionHandlerUnifiedSimple: Simplified Unified handler WITHOUT autonomous rescheduling
///
/// EXPERIMENT: This handler tests whether the Unified handler execution failures are caused by:
/// 1. Complex LoopConfig with embedded capabilities
/// 2. Auto-rescheduling logic
/// 3. Panic-based error handling
///
/// This handler uses:
/// - DCAControllerUnified (unified controller with optional COA)
/// - DCAPlanUnified (unified plan with requiresEVM() detection)
/// - V2Simple's PROVEN patterns (simple data, defensive returns, no auto-reschedule)
///
/// Storage: /storage/DCATransactionHandlerUnifiedSimple
access(all) contract DCATransactionHandlerUnifiedSimple {

    /// Simple transaction data - just the plan ID (like V2Simple)
    access(all) struct SimpleTransactionData {
        access(all) let planId: UInt64

        init(planId: UInt64) {
            self.planId = planId
        }
    }

    /// Event emitted when handler starts execution
    access(all) event HandlerExecutionStarted(
        transactionId: UInt64,
        planId: UInt64,
        owner: Address,
        requiresEVM: Bool,
        timestamp: UFix64
    )

    /// Event emitted when handler completes successfully
    access(all) event HandlerExecutionCompleted(
        transactionId: UInt64,
        planId: UInt64,
        owner: Address,
        amountIn: UFix64,
        amountOut: UFix64,
        swapType: String,
        executionCount: UInt64,
        timestamp: UFix64
    )

    /// Event emitted when handler execution fails
    access(all) event HandlerExecutionFailed(
        transactionId: UInt64,
        planId: UInt64?,
        owner: Address?,
        reason: String,
        timestamp: UFix64
    )

    /// Handler resource - simplified version with both Cadence and EVM swap support
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {

        /// Reference to the user's DCA controller (Unified)
        access(self) let controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>

        init(controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>) {
            pre {
                controllerCap.check(): "Invalid controller capability"
            }
            self.controllerCap = controllerCap
        }

        /// Main execution entrypoint - SIMPLIFIED (no rescheduling, defensive error handling)
        access(FlowTransactionScheduler.Execute) fun executeTransaction(id: UInt64, data: AnyStruct?) {
            let timestamp = getCurrentBlock().timestamp
            let ownerAddress = self.controllerCap.address

            // DEFENSIVE: Parse plan ID - simple format
            let txData = data as? SimpleTransactionData
            if txData == nil {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: nil,
                    owner: ownerAddress,
                    reason: "Invalid transaction data format",
                    timestamp: timestamp
                )
                return  // Return instead of panic
            }
            let planId = txData!.planId

            // DEFENSIVE: Borrow controller
            let controller = self.controllerCap.borrow()
            if controller == nil {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Could not borrow DCA controller",
                    timestamp: timestamp
                )
                return  // Return instead of panic
            }

            // DEFENSIVE: Borrow plan
            let planRef = controller!.borrowPlan(id: planId)
            if planRef == nil {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Could not borrow plan",
                    timestamp: timestamp
                )
                return  // Return instead of panic
            }

            let requiresEVM = planRef!.requiresEVM()

            emit HandlerExecutionStarted(
                transactionId: id,
                planId: planId,
                owner: ownerAddress,
                requiresEVM: requiresEVM,
                timestamp: timestamp
            )

            // DEFENSIVE: Validate plan is ready
            if !planRef!.isReadyForExecution() {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Plan not ready for execution",
                    timestamp: timestamp
                )
                return
            }

            // DEFENSIVE: Check max executions
            if planRef!.hasReachedMaxExecutions() {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Plan has reached maximum executions",
                    timestamp: timestamp
                )
                return
            }

            // Execute based on token routing
            var result: ExecutionResult? = nil
            if requiresEVM {
                result = self.executeEVMSwap(controller: controller!, planRef: planRef!)
            } else {
                result = self.executeCadenceSwap(controller: controller!, planRef: planRef!)
            }

            if result!.success {
                // Record successful execution
                planRef!.recordExecution(
                    amountIn: result!.amountIn!,
                    amountOut: result!.amountOut!
                )

                // Update next execution time (but DON'T schedule - external process does that)
                if planRef!.status == DCAPlanUnified.PlanStatus.Active && !planRef!.hasReachedMaxExecutions() {
                    planRef!.scheduleNextExecution()
                }

                emit HandlerExecutionCompleted(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    amountIn: result!.amountIn!,
                    amountOut: result!.amountOut!,
                    swapType: requiresEVM ? "EVM/UniswapV3" : "Cadence/IncrementFi",
                    executionCount: planRef!.executionCount,
                    timestamp: timestamp
                )
            } else {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: result!.errorMessage ?? "Unknown error",
                    timestamp: timestamp
                )
            }
        }

        /// Execute swap using IncrementFi SwapRouter (Cadence path for USDC)
        access(self) fun executeCadenceSwap(
            controller: auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller,
            planRef: &DCAPlanUnified.Plan
        ): ExecutionResult {
            let amountIn = planRef.amountPerInterval

            // DEFENSIVE: Get vault capabilities
            let sourceVaultCap = controller.getSourceVaultCapability()
            if sourceVaultCap == nil {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Source vault capability not configured"
                )
            }

            let targetVaultCap = controller.getTargetVaultCapability()
            if targetVaultCap == nil {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Target vault capability not configured"
                )
            }

            // DEFENSIVE: Validate capabilities
            if !sourceVaultCap!.check() {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Invalid source vault capability"
                )
            }

            if !targetVaultCap!.check() {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Invalid target vault capability"
                )
            }

            // Borrow source vault
            let sourceVault = sourceVaultCap!.borrow()!

            if sourceVault.balance < amountIn {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Insufficient balance"
                )
            }

            // Withdraw tokens
            let tokensToSwap <- sourceVault.withdraw(amount: amountIn)

            // Determine swap path
            let sourceTypeId = planRef.sourceTokenType.identifier
            let targetTypeId = planRef.targetTokenType.identifier

            let tokenPath: [String] = []
            if sourceTypeId.contains("EVMVMBridgedToken") && targetTypeId.contains("FlowToken") {
                // USDC → FLOW
                tokenPath.append("A.1e4aa0b87d10b141.EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14")
                tokenPath.append("A.1654653399040a61.FlowToken")
            } else if targetTypeId.contains("EVMVMBridgedToken") && sourceTypeId.contains("FlowToken") {
                // FLOW → USDC
                tokenPath.append("A.1654653399040a61.FlowToken")
                tokenPath.append("A.1e4aa0b87d10b141.EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14")
            } else {
                destroy tokensToSwap
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Unsupported token pair for Cadence swap"
                )
            }

            // Get expected output
            let expectedAmountsOut = SwapRouter.getAmountsOut(
                amountIn: amountIn,
                tokenKeyPath: tokenPath
            )
            let expectedAmountOut = expectedAmountsOut[expectedAmountsOut.length - 1]

            // Calculate minimum with slippage
            let slippageMultiplier = UInt64(10000) - planRef.maxSlippageBps
            let minAmountOut = expectedAmountOut * UFix64(slippageMultiplier) / 10000.0

            let deadline = getCurrentBlock().timestamp + 300.0

            // Execute swap
            let swappedTokens <- SwapRouter.swapExactTokensForTokens(
                exactVaultIn: <-tokensToSwap,
                amountOutMin: minAmountOut,
                tokenKeyPath: tokenPath,
                deadline: deadline
            )

            let actualAmountOut = swappedTokens.balance

            // Deposit to target
            let targetVault = targetVaultCap!.borrow()!
            targetVault.deposit(from: <-swappedTokens)

            return ExecutionResult(
                success: true,
                amountIn: amountIn,
                amountOut: actualAmountOut,
                errorMessage: nil
            )
        }

        /// Execute swap using UniswapV3 via COA (EVM path for USDF)
        access(self) fun executeEVMSwap(
            controller: auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller,
            planRef: &DCAPlanUnified.Plan
        ): ExecutionResult {
            let amountIn = planRef.amountPerInterval

            // DEFENSIVE: Check COA capability
            let coaCap = controller.getCOACapability()
            if coaCap == nil {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "COA capability not configured - required for EVM swaps"
                )
            }

            if !coaCap!.check() {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Invalid COA capability"
                )
            }

            // DEFENSIVE: Get vault capabilities
            let sourceVaultCap = controller.getSourceVaultCapability()
            if sourceVaultCap == nil {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Source vault capability not configured"
                )
            }

            let targetVaultCap = controller.getTargetVaultCapability()
            if targetVaultCap == nil {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Target vault capability not configured"
                )
            }

            // DEFENSIVE: Validate capabilities
            if !sourceVaultCap!.check() {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Invalid source vault capability"
                )
            }

            if !targetVaultCap!.check() {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Invalid target vault capability"
                )
            }

            // Borrow source vault
            let sourceVault = sourceVaultCap!.borrow()!

            if sourceVault.balance < amountIn {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Insufficient balance"
                )
            }

            // Withdraw FLOW tokens
            let tokensToSwap <- sourceVault.withdraw(amount: amountIn) as! @FlowToken.Vault

            // Determine token path and types for EVM swap
            let sourceTypeId = planRef.sourceTokenType.identifier
            let targetTypeId = planRef.targetTokenType.identifier

            // USDF token contract (EVM-bridged)
            let usdfEVMAddress = EVM.addressFromString("0x2aabea2058b5ac2d339b163c6ab6f2b6d53aabed")
            // WFLOW on EVM
            let wflowEVMAddress = EVM.addressFromString("0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e")

            var tokenPath: [EVM.EVMAddress] = []
            var inVaultType: Type = planRef.sourceTokenType
            var outVaultType: Type = planRef.targetTokenType

            if sourceTypeId.contains("FlowToken") {
                // FLOW -> USDF
                tokenPath = [wflowEVMAddress, usdfEVMAddress]
            } else if targetTypeId.contains("FlowToken") {
                // USDF -> FLOW
                tokenPath = [usdfEVMAddress, wflowEVMAddress]
            } else {
                destroy tokensToSwap
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Unsupported pair for EVM swap"
                )
            }

            // Create swapper with 0.3% fee tier (3000)
            let swapper <- UniswapV3SwapperConnector.createSwapperWithDefaults(
                tokenPath: tokenPath,
                feePath: [3000],
                inVaultType: inVaultType,
                outVaultType: outVaultType,
                coaCapability: coaCap!
            )

            // Get quote with slippage
            let quote = swapper.getQuote(
                fromTokenType: inVaultType,
                toTokenType: outVaultType,
                amount: amountIn
            )

            // Apply plan's slippage
            let adjustedMinAmount = quote.expectedAmount * (10000.0 - UFix64(planRef.maxSlippageBps)) / 10000.0
            let adjustedQuote = DeFiActions.Quote(
                expectedAmount: quote.expectedAmount,
                minAmount: adjustedMinAmount,
                slippageTolerance: UFix64(planRef.maxSlippageBps) / 10000.0,
                deadline: nil,
                data: quote.data
            )

            // Execute swap
            let swapped <- swapper.swap(inVault: <-tokensToSwap, quote: adjustedQuote)
            let amountOut = swapped.balance

            // Deposit to target
            let targetVault = targetVaultCap!.borrow()!
            targetVault.deposit(from: <-swapped)

            // Cleanup swapper
            destroy swapper

            return ExecutionResult(
                success: true,
                amountIn: amountIn,
                amountOut: amountOut,
                errorMessage: nil
            )
        }

        access(all) view fun getViews(): [Type] {
            return [Type<StoragePath>(), Type<PublicPath>()]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<StoragePath>():
                    return /storage/DCATransactionHandlerUnifiedSimple
                case Type<PublicPath>():
                    return /public/DCATransactionHandlerUnifiedSimple
                default:
                    return nil
            }
        }
    }

    /// Result struct for swap execution
    access(all) struct ExecutionResult {
        access(all) let success: Bool
        access(all) let amountIn: UFix64?
        access(all) let amountOut: UFix64?
        access(all) let errorMessage: String?

        init(success: Bool, amountIn: UFix64?, amountOut: UFix64?, errorMessage: String?) {
            self.success = success
            self.amountIn = amountIn
            self.amountOut = amountOut
            self.errorMessage = errorMessage
        }
    }

    /// Factory function
    access(all) fun createHandler(
        controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>
    ): @Handler {
        return <- create Handler(controllerCap: controllerCap)
    }

    /// Helper to create transaction data
    access(all) fun createTransactionData(planId: UInt64): SimpleTransactionData {
        return SimpleTransactionData(planId: planId)
    }
}
