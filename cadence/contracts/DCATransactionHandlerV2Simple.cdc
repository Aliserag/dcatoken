import "FlowTransactionScheduler"
import "DCAControllerV2"
import "DCAPlanV2"
import "DeFiMath"
import "FungibleToken"
import "FlowToken"
import "SwapRouter"
import EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14 from 0x1e4aa0b87d10b141

/// DCATransactionHandlerV2Simple: Simplified handler WITHOUT autonomous rescheduling
///
/// This is a stripped-down version of DCATransactionHandlerV2 that:
/// - Executes DCA swaps via IncrementFi
/// - Records execution results
/// - Does NOT reschedule itself (external process handles rescheduling)
///
/// This reduces handler complexity from ~550 lines to ~200 lines,
/// removing the scheduleNextExecution() logic that may exceed scheduler limits.
access(all) contract DCATransactionHandlerV2Simple {

    /// Simple transaction data - just the plan ID
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
        timestamp: UFix64
    )

    /// Event emitted when handler completes successfully
    access(all) event HandlerExecutionCompleted(
        transactionId: UInt64,
        planId: UInt64,
        owner: Address,
        amountIn: UFix64,
        amountOut: UFix64,
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

    /// Handler resource - simplified version
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {

        /// Reference to the user's DCA controller
        access(self) let controllerCap: Capability<auth(DCAControllerV2.Owner) &DCAControllerV2.Controller>

        init(controllerCap: Capability<auth(DCAControllerV2.Owner) &DCAControllerV2.Controller>) {
            pre {
                controllerCap.check(): "Invalid controller capability"
            }
            self.controllerCap = controllerCap
        }

        /// Main execution entrypoint - SIMPLIFIED (no rescheduling)
        access(FlowTransactionScheduler.Execute) fun executeTransaction(id: UInt64, data: AnyStruct?) {
            let timestamp = getCurrentBlock().timestamp

            // Parse plan ID - simple format
            let txData = data as! SimpleTransactionData? ?? panic("Invalid transaction data")
            let planId = txData.planId
            let ownerAddress = self.controllerCap.address

            emit HandlerExecutionStarted(
                transactionId: id,
                planId: planId,
                owner: ownerAddress,
                timestamp: timestamp
            )

            // Borrow controller
            let controller = self.controllerCap.borrow()
                ?? panic("Could not borrow DCA controller")

            // Borrow plan
            let planRef = controller.borrowPlan(id: planId)
                ?? panic("Could not borrow plan")

            // Validate plan is ready
            if !planRef.isReadyForExecution() {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Plan not ready for execution",
                    timestamp: timestamp
                )
                return
            }

            // Check max executions
            if planRef.hasReachedMaxExecutions() {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Plan has reached maximum executions",
                    timestamp: timestamp
                )
                return
            }

            // Get vault capabilities
            let sourceVaultCap = controller.getSourceVaultCapability()
                ?? panic("Source vault capability not configured")
            let targetVaultCap = controller.getTargetVaultCapability()
                ?? panic("Target vault capability not configured")

            // Validate capabilities
            if !sourceVaultCap.check() {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Invalid source vault capability",
                    timestamp: timestamp
                )
                return
            }

            if !targetVaultCap.check() {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Invalid target vault capability",
                    timestamp: timestamp
                )
                return
            }

            // Execute the swap
            let result = self.executeSwap(
                planRef: planRef,
                sourceVaultCap: sourceVaultCap,
                targetVaultCap: targetVaultCap
            )

            if result.success {
                // Record successful execution
                planRef.recordExecution(
                    amountIn: result.amountIn!,
                    amountOut: result.amountOut!
                )

                // Update next execution time (but DON'T schedule - external process does that)
                if planRef.status == DCAPlanV2.PlanStatus.Active && !planRef.hasReachedMaxExecutions() {
                    planRef.scheduleNextExecution()
                }

                emit HandlerExecutionCompleted(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    amountIn: result.amountIn!,
                    amountOut: result.amountOut!,
                    executionCount: planRef.executionCount,
                    timestamp: timestamp
                )
            } else {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: result.errorMessage ?? "Unknown error",
                    timestamp: timestamp
                )
            }
        }

        /// Execute swap using IncrementFi SwapRouter
        access(self) fun executeSwap(
            planRef: &DCAPlanV2.Plan,
            sourceVaultCap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>,
            targetVaultCap: Capability<&{FungibleToken.Receiver}>
        ): ExecutionResult {
            let amountIn = planRef.amountPerInterval

            // Borrow source vault
            let sourceVault = sourceVaultCap.borrow()
                ?? panic("Could not borrow source vault")

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
                tokenPath.append("A.1e4aa0b87d10b141.EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14")
                tokenPath.append("A.1654653399040a61.FlowToken")
            } else if targetTypeId.contains("EVMVMBridgedToken") && sourceTypeId.contains("FlowToken") {
                tokenPath.append("A.1654653399040a61.FlowToken")
                tokenPath.append("A.1e4aa0b87d10b141.EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14")
            } else {
                destroy tokensToSwap
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Unsupported token pair"
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
            let targetVault = targetVaultCap.borrow()
                ?? panic("Could not borrow target vault")
            targetVault.deposit(from: <-swappedTokens)

            return ExecutionResult(
                success: true,
                amountIn: amountIn,
                amountOut: actualAmountOut,
                errorMessage: nil
            )
        }

        access(all) view fun getViews(): [Type] {
            return [Type<StoragePath>(), Type<PublicPath>()]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<StoragePath>():
                    return /storage/DCATransactionHandlerV2Simple
                case Type<PublicPath>():
                    return /public/DCATransactionHandlerV2Simple
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
        controllerCap: Capability<auth(DCAControllerV2.Owner) &DCAControllerV2.Controller>
    ): @Handler {
        return <- create Handler(controllerCap: controllerCap)
    }

    /// Helper to create transaction data
    access(all) fun createTransactionData(planId: UInt64): SimpleTransactionData {
        return SimpleTransactionData(planId: planId)
    }
}
