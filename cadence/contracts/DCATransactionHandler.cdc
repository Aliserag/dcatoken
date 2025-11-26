import "FlowTransactionScheduler"
import "DCAController"
import "DCAPlan"
import "DeFiMath"
import "DeFiActions"
import "FungibleToken"
import "FlowToken"

/// DCATransactionHandler: Scheduled transaction handler for DCA execution
///
/// This contract implements the FlowTransactionScheduler.TransactionHandler interface
/// to enable autonomous DCA plan execution via Forte Scheduled Transactions.
///
/// Architecture:
/// 1. User creates DCA plan with DCAController
/// 2. Plan schedules execution via FlowTransactionScheduler
/// 3. At scheduled time, scheduler calls this handler's executeTransaction()
/// 4. Handler:
///    - Validates plan is ready
///    - Builds DeFi Actions stack (Source → Swapper → Sink)
///    - Executes swap
///    - Updates plan accounting
///    - Reschedules next execution if plan is still active
///
/// Educational Notes:
/// - Implements FlowTransactionScheduler.TransactionHandler interface
/// - Access control: executeTransaction is access(FlowTransactionScheduler.Execute)
/// - Uses DeFi Actions for composable swap execution
/// - Stores metadata via getViews/resolveView for discoverability
access(all) contract DCATransactionHandler {

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
        nextExecutionScheduled: Bool,
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

    /// Handler resource that implements the Scheduled Transaction interface
    ///
    /// Each user has one instance of this stored in their account.
    /// The scheduler calls executeTransaction() when a DCA plan is due.
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {

        /// Reference to the user's DCA controller
        /// This capability allows the handler to access and update plans
        access(self) let controllerCap: Capability<auth(DCAController.Owner) &DCAController.Controller>

        init(controllerCap: Capability<auth(DCAController.Owner) &DCAController.Controller>) {
            pre {
                controllerCap.check(): "Invalid controller capability"
            }
            self.controllerCap = controllerCap
        }

        /// Main execution entrypoint called by FlowTransactionScheduler
        ///
        /// @param id: Transaction ID from the scheduler
        /// @param data: Encoded plan data (contains planId)
        ///
        /// This function has restricted access - only FlowTransactionScheduler can call it
        access(FlowTransactionScheduler.Execute) fun executeTransaction(id: UInt64, data: AnyStruct?) {
            let timestamp = getCurrentBlock().timestamp

            // Parse plan ID from transaction data
            let planData = data as! {String: UInt64}? ?? panic("Invalid transaction data format")
            let planId = planData["planId"] ?? panic("Plan ID not found in transaction data")
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
                ?? panic("Could not borrow plan with ID: ".concat(planId.toString()))

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

                // Schedule next execution if plan is still active
                var nextScheduled = false
                if planRef.status == DCAPlan.PlanStatus.Active && !planRef.hasReachedMaxExecutions() {
                    planRef.scheduleNextExecution()
                    nextScheduled = true

                    // TODO: In production, call FlowTransactionScheduler.schedule() here
                    // to schedule the next execution. See CLAUDE.md for integration notes.
                }

                emit HandlerExecutionCompleted(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    amountIn: result.amountIn!,
                    amountOut: result.amountOut!,
                    nextExecutionScheduled: nextScheduled,
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

        /// Execute swap using DeFi Actions
        ///
        /// This builds a Flow Actions stack: Source → Swapper → Sink
        /// For the initial version, we use a simplified swap.
        /// TODO: Integrate real IncrementFi swap connectors
        ///
        /// @param planRef: Reference to the DCA plan
        /// @param sourceVaultCap: Capability to withdraw from source vault
        /// @param targetVaultCap: Capability to deposit to target vault
        /// @return ExecutionResult with success status and amounts
        access(self) fun executeSwap(
            planRef: &DCAPlan.Plan,
            sourceVaultCap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>,
            targetVaultCap: Capability<&{FungibleToken.Receiver}>
        ): ExecutionResult {
            // Get amount to invest
            let amountIn = planRef.amountPerInterval

            // Borrow source vault and check balance
            let sourceVault = sourceVaultCap.borrow()
                ?? panic("Could not borrow source vault")

            if sourceVault.balance < amountIn {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Insufficient balance in source vault. Required: ".concat(amountIn.toString()).concat(", Available: ").concat(sourceVault.balance.toString())
                )
            }

            // Withdraw tokens to swap
            let tokensToSwap <- sourceVault.withdraw(amount: amountIn)

            // TODO: Integrate real IncrementFi swap connector via DeFi Actions
            // For now, use simplified swap simulation
            let amountOut = self.simulateSwap(amountIn: amountIn)

            // In production, this would be:
            // 1. Create swapper connector from IncrementFi
            // 2. Calculate minimum output with slippage protection
            // 3. Execute swap via DeFi Actions
            // 4. Receive swapped tokens
            //
            // Example:
            // let swapper = IncrementSwapConnector.createSwapper(...)
            // let minOut = DeFiMath.calculateMinOutWithSlippage(
            //     amountIn: amountIn,
            //     expectedPriceFP128: planRef.avgExecutionPriceFP128,
            //     slippageBps: planRef.maxSlippageBps
            // )
            // let swappedTokens <- swapper.swap(tokens: <-tokensToSwap, minOut: minOut)

            // For now, tokensToSwap represents the swapped tokens
            let swappedTokens <- tokensToSwap

            // Deposit to target vault
            let targetVault = targetVaultCap.borrow()
                ?? panic("Could not borrow target vault")

            targetVault.deposit(from: <-swappedTokens)

            return ExecutionResult(
                success: true,
                amountIn: amountIn,
                amountOut: amountOut,
                errorMessage: nil
            )
        }

        /// Simulate a swap for testing/development
        ///
        /// Returns a simulated output amount based on a mock price.
        /// TODO: Replace with real IncrementFi swap connector
        access(self) fun simulateSwap(amountIn: UFix64): UFix64 {
            // Simulate: 1 FLOW = 2.5 Beaver
            // Add small variance based on block height for realism
            let basePrice = 2.5
            let variance = 0.02
            let randomFactor = 1.0 + (variance * (UFix64(getCurrentBlock().height % 100) / 100.0 - 0.5))
            return amountIn * basePrice * randomFactor
        }

        /// Get supported view types (for resource metadata)
        access(all) view fun getViews(): [Type] {
            return [Type<StoragePath>(), Type<PublicPath>()]
        }

        /// Resolve a specific view type
        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<StoragePath>():
                    return /storage/DCATransactionHandler
                case Type<PublicPath>():
                    return /public/DCATransactionHandler
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

    /// Factory function to create a new handler
    ///
    /// @param controllerCap: Capability to the user's DCA controller
    /// @return New handler resource
    access(all) fun createHandler(
        controllerCap: Capability<auth(DCAController.Owner) &DCAController.Controller>
    ): @Handler {
        return <- create Handler(controllerCap: controllerCap)
    }
}
