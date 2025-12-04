import "FlowTransactionScheduler"
import "FlowTransactionSchedulerUtils"
import "DCAControllerV3"
import "DCAPlanV3"
import "DeFiMath"
import "FungibleToken"
import "FlowToken"
import "EVM"
import "UniswapV3SwapperConnector"
import "EVMTokenRegistry"
import "DeFiActions"

/// DCATransactionHandler: Scheduled transaction handler for DCA execution (EVM DEX swaps)
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
///    - Creates UniswapV3Swapper with COA capability
///    - Executes swap on Flow EVM (FlowSwap V3 → PunchSwap V2 fallback)
///    - Updates plan accounting
///    - Reschedules next execution if plan is still active
///
/// Educational Notes:
/// - Implements FlowTransactionScheduler.TransactionHandler interface
/// - Access control: executeTransaction is access(FlowTransactionScheduler.Execute)
/// - Uses DeFiActions.Swapper pattern for protocol-agnostic swaps
/// - COA-based EVM execution (no manual wallet approvals)
/// - Stores metadata via getViews/resolveView for discoverability
access(all) contract DCATransactionHandlerV3 {

    /// Configuration for scheduling next execution
    access(all) struct ScheduleConfig {
        access(all) let schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>
        access(all) let priority: FlowTransactionScheduler.Priority
        access(all) let executionEffort: UInt64

        init(
            schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>,
            priority: FlowTransactionScheduler.Priority,
            executionEffort: UInt64
        ) {
            self.schedulerManagerCap = schedulerManagerCap
            self.priority = priority
            self.executionEffort = executionEffort
        }
    }

    /// Transaction data passed to handler
    access(all) struct DCATransactionData {
        access(all) let planId: UInt64
        access(all) let scheduleConfig: ScheduleConfig

        init(planId: UInt64, scheduleConfig: ScheduleConfig) {
            self.planId = planId
            self.scheduleConfig = scheduleConfig
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

    /// Event emitted when next execution scheduling fails
    access(all) event NextExecutionSchedulingFailed(
        planId: UInt64,
        owner: Address,
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
        access(self) let controllerCap: Capability<auth(DCAControllerV3.Owner) &DCAControllerV3.Controller>

        init(controllerCap: Capability<auth(DCAControllerV3.Owner) &DCAControllerV3.Controller>) {
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

            // Parse transaction data
            let txData = data as! DCATransactionData? ?? panic("Invalid transaction data format")
            let planId = txData.planId
            let scheduleConfig = txData.scheduleConfig
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

            let coaCap = controller.getCOACapability()
                ?? panic("COA capability not configured")

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

            if !coaCap.check() {
                emit HandlerExecutionFailed(
                    transactionId: id,
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Invalid COA capability",
                    timestamp: timestamp
                )
                return
            }

            // Execute the swap
            let result = self.executeSwap(
                planRef: planRef,
                sourceVaultCap: sourceVaultCap,
                targetVaultCap: targetVaultCap,
                coaCap: coaCap
            )

            if result.success {
                // Record successful execution
                planRef.recordExecution(
                    amountIn: result.amountIn!,
                    amountOut: result.amountOut!
                )

                // Schedule next execution if plan is still active
                var nextScheduled = false
                if planRef.status == DCAPlanV3.PlanStatus.Active && !planRef.hasReachedMaxExecutions() {
                    planRef.scheduleNextExecution()

                    // Attempt to schedule next execution via Manager
                    let schedulingResult = self.scheduleNextExecution(
                        planId: planId,
                        nextExecutionTime: planRef.nextExecutionTime,
                        scheduleConfig: scheduleConfig
                    )

                    nextScheduled = schedulingResult
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

        /// Execute swap using UniswapV3SwapperConnector on Flow EVM
        ///
        /// This uses production EVM DEX infrastructure (FlowSwap V3 → PunchSwap V2 fallback)
        /// with COA-based execution and FlowEVMBridge for token conversion.
        ///
        /// @param planRef: Reference to the DCA plan
        /// @param sourceVaultCap: Capability to withdraw from source vault
        /// @param targetVaultCap: Capability to deposit to target vault
        /// @param coaCap: COA capability for EVM operations
        /// @return ExecutionResult with success status and amounts
        access(self) fun executeSwap(
            planRef: &DCAPlanV3.Plan,
            sourceVaultCap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>,
            targetVaultCap: Capability<&{FungibleToken.Receiver}>,
            coaCap: Capability<auth(EVM.Owner) &EVM.CadenceOwnedAccount>
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

            // Get EVM addresses for source and target tokens
            let sourceEVMAddr = EVMTokenRegistry.getEVMAddress(planRef.sourceTokenType)
            if sourceEVMAddr == nil {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Source token not registered in EVMTokenRegistry: ".concat(planRef.sourceTokenType.identifier)
                )
            }

            let targetEVMAddr = EVMTokenRegistry.getEVMAddress(planRef.targetTokenType)
            if targetEVMAddr == nil {
                return ExecutionResult(
                    success: false,
                    amountIn: nil,
                    amountOut: nil,
                    errorMessage: "Target token not registered in EVMTokenRegistry: ".concat(planRef.targetTokenType.identifier)
                )
            }

            // Create EVM token path (source → target)
            let evmTokenPath: [EVM.EVMAddress] = [sourceEVMAddr!, targetEVMAddr!]

            // Use 3000 (0.3%) fee tier for most pairs (standard UniswapV3 fee)
            let feePath: [UInt32] = [3000]

            // Create swapper with defaults (FlowSwap V3 router)
            let swapper <- UniswapV3SwapperConnector.createSwapperWithDefaults(
                tokenPath: evmTokenPath,
                feePath: feePath,
                inVaultType: planRef.sourceTokenType,
                outVaultType: planRef.targetTokenType,
                coaCapability: coaCap
            )

            // Get quote from swapper
            let quote = swapper.getQuote(
                fromTokenType: planRef.sourceTokenType,
                toTokenType: planRef.targetTokenType,
                amount: amountIn
            )

            // Apply user's slippage tolerance to quote
            // maxSlippageBps is in basis points (100 = 1%)
            let slippageMultiplier = UInt64(10000) - planRef.maxSlippageBps
            let minAmountOut = quote.expectedAmount * UFix64(slippageMultiplier) / 10000.0

            // Create adjusted quote with user's slippage protection
            let adjustedQuote = DeFiActions.Quote(
                expectedAmount: quote.expectedAmount,
                minAmount: minAmountOut,
                slippageTolerance: UFix64(planRef.maxSlippageBps) / 10000.0,
                deadline: getCurrentBlock().timestamp + 300.0, // 5 minutes
                data: quote.data
            )

            // Withdraw tokens to swap
            let tokensToSwap <- sourceVault.withdraw(amount: amountIn)

            // Execute swap
            let swappedTokens <- swapper.swap(
                inVault: <-tokensToSwap,
                quote: adjustedQuote
            )

            // Clean up swapper resource
            destroy swapper

            // Get actual output amount
            let actualAmountOut = swappedTokens.balance

            // Deposit to target vault
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

        /// Schedule the next execution via FlowTransactionScheduler Manager
        ///
        /// This function handles the recursive scheduling pattern using the Manager approach:
        /// 1. Extract ScheduleConfig from transaction data (contains Manager capability)
        /// 2. Estimate fees for next execution
        /// 3. Withdraw FLOW fees from user's controller
        /// 4. Call manager.scheduleByHandler() to schedule next execution
        ///
        /// @param planId: Plan ID to include in transaction data
        /// @param nextExecutionTime: Timestamp for next execution
        /// @param scheduleConfig: Configuration containing Manager capability
        /// @return Bool indicating if scheduling succeeded
        access(self) fun scheduleNextExecution(
            planId: UInt64,
            nextExecutionTime: UFix64?,
            scheduleConfig: ScheduleConfig
        ): Bool {
            let ownerAddress = self.controllerCap.address
            let timestamp = getCurrentBlock().timestamp

            // Verify nextExecutionTime is provided
            if nextExecutionTime == nil {
                emit NextExecutionSchedulingFailed(
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Next execution time not set",
                    timestamp: timestamp
                )
                return false
            }

            // Prepare transaction data with plan ID and schedule config
            let transactionData = DCATransactionData(
                planId: planId,
                scheduleConfig: scheduleConfig
            )

            // Estimate fees for the next execution
            let estimate = FlowTransactionScheduler.estimate(
                data: transactionData,
                timestamp: nextExecutionTime!,
                priority: scheduleConfig.priority,
                executionEffort: scheduleConfig.executionEffort
            )

            // Check if estimation was successful
            assert(
                estimate.timestamp != nil || scheduleConfig.priority == FlowTransactionScheduler.Priority.Low,
                message: estimate.error ?? "Fee estimation failed"
            )

            // Borrow the controller to access fee vault
            let controller = self.controllerCap.borrow()
            if controller == nil {
                emit NextExecutionSchedulingFailed(
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Could not borrow controller",
                    timestamp: timestamp
                )
                return false
            }

            // Get fee vault capability from controller
            let feeVaultCap = controller!.getFeeVaultCapability()
            if feeVaultCap == nil || !feeVaultCap!.check() {
                emit NextExecutionSchedulingFailed(
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Fee vault capability invalid or not set",
                    timestamp: timestamp
                )
                return false
            }

            // Withdraw fees
            let feeVault = feeVaultCap!.borrow()
            if feeVault == nil {
                emit NextExecutionSchedulingFailed(
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Could not borrow fee vault",
                    timestamp: timestamp
                )
                return false
            }

            let feeAmount = estimate.flowFee ?? 0.0
            if feeVault!.balance < feeAmount {
                emit NextExecutionSchedulingFailed(
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Insufficient FLOW for fees. Required: ".concat(feeAmount.toString()).concat(", Available: ").concat(feeVault!.balance.toString()),
                    timestamp: timestamp
                )
                return false
            }

            let fees <- feeVault!.withdraw(amount: feeAmount)

            // Borrow scheduler manager
            let schedulerManager = scheduleConfig.schedulerManagerCap.borrow()
            if schedulerManager == nil {
                destroy fees
                emit NextExecutionSchedulingFailed(
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Could not borrow scheduler manager",
                    timestamp: timestamp
                )
                return false
            }

            // Use scheduleByHandler() on the Manager to schedule next execution
            // This works because the handler was previously scheduled through this Manager
            let scheduledId = schedulerManager!.scheduleByHandler(
                handlerTypeIdentifier: self.getType().identifier,
                handlerUUID: self.uuid,
                data: transactionData,
                timestamp: nextExecutionTime!,
                priority: scheduleConfig.priority,
                executionEffort: scheduleConfig.executionEffort,
                fees: <-fees as! @FlowToken.Vault
            )

            // scheduledId > 0 means success
            if scheduledId == 0 {
                emit NextExecutionSchedulingFailed(
                    planId: planId,
                    owner: ownerAddress,
                    reason: "Manager.scheduleByHandler() returned 0 (failed to schedule)",
                    timestamp: timestamp
                )
                return false
            }

            return true
        }

        /// Get supported view types (for resource metadata)
        access(all) view fun getViews(): [Type] {
            return [Type<StoragePath>(), Type<PublicPath>()]
        }

        /// Resolve a specific view type
        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<StoragePath>():
                    return /storage/DCATransactionHandlerV3
                case Type<PublicPath>():
                    return /public/DCATransactionHandlerV3
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
        controllerCap: Capability<auth(DCAControllerV3.Owner) &DCAControllerV3.Controller>
    ): @Handler {
        return <- create Handler(controllerCap: controllerCap)
    }

    /// Helper function to create schedule configuration
    access(all) fun createScheduleConfig(
        schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>,
        priority: FlowTransactionScheduler.Priority,
        executionEffort: UInt64
    ): ScheduleConfig {
        return ScheduleConfig(
            schedulerManagerCap: schedulerManagerCap,
            priority: priority,
            executionEffort: executionEffort
        )
    }

    /// Helper function to create transaction data
    access(all) fun createTransactionData(
        planId: UInt64,
        scheduleConfig: ScheduleConfig
    ): DCATransactionData {
        return DCATransactionData(
            planId: planId,
            scheduleConfig: scheduleConfig
        )
    }
}
