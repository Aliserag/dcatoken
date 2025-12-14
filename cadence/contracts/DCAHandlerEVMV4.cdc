import FlowTransactionScheduler from "FlowTransactionScheduler"
import FlowTransactionSchedulerUtils from "FlowTransactionSchedulerUtils"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"
import DCAServiceEVM from "DCAServiceEVM"

/// DCAHandlerEVMV4: Autonomous Scheduled Transaction Handler for EVM-Native DCA
///
/// This version follows the official scaffold pattern (CounterLoopTransactionHandler):
/// - Capabilities are passed IN the TransactionData struct (LoopConfig pattern)
/// - Handler does NOT store capabilities internally
/// - Uses Manager.scheduleByHandler() for autonomous rescheduling
///
/// Key Difference from V3:
/// V3 stored capabilities in the Handler resource and issued new caps each time.
/// V4 passes capabilities through TransactionData, allowing proper serialization
/// and retrieval via getControllers().
///
access(all) contract DCAHandlerEVMV4 {

    // ============================================================
    // Events
    // ============================================================

    access(all) event HandlerCreated(uuid: UInt64)
    access(all) event ExecutionTriggered(planId: UInt64, success: Bool, nextScheduled: Bool)
    access(all) event ExecutionSkipped(planId: UInt64, reason: String)
    access(all) event NextExecutionScheduled(planId: UInt64, scheduledId: UInt64, timestamp: UFix64)
    access(all) event NextExecutionSchedulingFailed(planId: UInt64, reason: String)

    // ============================================================
    // Storage Paths
    // ============================================================

    access(all) let HandlerStoragePath: StoragePath
    access(all) let HandlerPublicPath: PublicPath

    // ============================================================
    // LoopConfig: Scheduling configuration passed in TransactionData
    // ============================================================

    /// Following the scaffold's LoopConfig pattern:
    /// Capabilities are passed IN the data, not stored in handler.
    access(all) struct LoopConfig {
        /// Capability to the Manager for scheduling next transactions
        access(all) let schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>

        /// Capability to withdraw FLOW for scheduling fees
        access(all) let feeProviderCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>

        /// Transaction priority
        access(all) let priority: FlowTransactionScheduler.Priority

        /// Execution effort (compute limit)
        access(all) let executionEffort: UInt64

        init(
            schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>,
            feeProviderCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>,
            priority: FlowTransactionScheduler.Priority,
            executionEffort: UInt64
        ) {
            self.schedulerManagerCap = schedulerManagerCap
            self.feeProviderCap = feeProviderCap
            self.priority = priority
            self.executionEffort = executionEffort
        }
    }

    // ============================================================
    // TransactionData: Carries plan ID + LoopConfig for rescheduling
    // ============================================================

    access(all) struct TransactionData {
        access(all) let planId: UInt64
        access(all) let loopConfig: LoopConfig

        init(planId: UInt64, loopConfig: LoopConfig) {
            self.planId = planId
            self.loopConfig = loopConfig
        }
    }

    // ============================================================
    // Handler Resource
    // ============================================================

    /// Handler resource that implements TransactionHandler interface.
    /// Does NOT store capabilities - they come from TransactionData.
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {

        /// Main execution entrypoint called by FlowTransactionScheduler
        access(FlowTransactionScheduler.Execute)
        fun executeTransaction(id: UInt64, data: AnyStruct?) {
            // Parse transaction data
            let txData = data as? TransactionData
            if txData == nil {
                log("DCAHandlerEVMV4: Invalid transaction data")
                return
            }

            let planId = txData!.planId
            let loopConfig = txData!.loopConfig

            // Get plan details
            let planOpt = DCAServiceEVM.getPlan(planId: planId)
            if planOpt == nil {
                emit ExecutionSkipped(planId: planId, reason: "Plan not found")
                return
            }
            let plan = planOpt!

            // Check if plan is active
            if plan.getStatus() != DCAServiceEVM.PlanStatus.Active {
                emit ExecutionSkipped(planId: planId, reason: "Plan not active")
                return
            }

            // Execute the DCA plan via DCAServiceEVM
            let success = DCAServiceEVM.executePlan(planId: planId)

            // If successful and plan still active, schedule next execution
            var nextScheduled = false
            if success {
                // Re-fetch plan to get updated nextExecutionTime
                let updatedPlanOpt = DCAServiceEVM.getPlan(planId: planId)
                if updatedPlanOpt != nil {
                    let updatedPlan = updatedPlanOpt!

                    // Only reschedule if plan is still active
                    if updatedPlan.getStatus() == DCAServiceEVM.PlanStatus.Active {
                        nextScheduled = self.scheduleNextExecution(
                            planId: planId,
                            nextExecutionTime: updatedPlan.nextExecutionTime,
                            loopConfig: loopConfig
                        )
                    }
                }
            }

            emit ExecutionTriggered(planId: planId, success: success, nextScheduled: nextScheduled)
        }

        /// Schedule the next execution using capabilities from LoopConfig
        access(self) fun scheduleNextExecution(
            planId: UInt64,
            nextExecutionTime: UFix64?,
            loopConfig: LoopConfig
        ): Bool {
            // Verify nextExecutionTime is provided
            if nextExecutionTime == nil {
                emit NextExecutionSchedulingFailed(planId: planId, reason: "Next execution time not set")
                return false
            }

            // Prepare next transaction data (pass same loopConfig for chaining)
            let nextTxData = TransactionData(planId: planId, loopConfig: loopConfig)

            // Estimate fees
            let estimate = FlowTransactionScheduler.estimate(
                data: nextTxData,
                timestamp: nextExecutionTime!,
                priority: loopConfig.priority,
                executionEffort: loopConfig.executionEffort
            )

            let feeAmount = estimate.flowFee ?? 0.001
            let feeWithBuffer = feeAmount * 1.1

            // Borrow fee vault from capability
            let feeVault = loopConfig.feeProviderCap.borrow()
            if feeVault == nil {
                emit NextExecutionSchedulingFailed(planId: planId, reason: "Could not borrow fee vault")
                return false
            }

            // Check balance
            if feeVault!.balance < feeWithBuffer {
                emit NextExecutionSchedulingFailed(
                    planId: planId,
                    reason: "Insufficient fees. Required: ".concat(feeWithBuffer.toString()).concat(" Available: ").concat(feeVault!.balance.toString())
                )
                return false
            }

            // Withdraw fees
            let fees <- feeVault!.withdraw(amount: feeWithBuffer)

            // Borrow scheduler manager from capability
            let schedulerManager = loopConfig.schedulerManagerCap.borrow()
            if schedulerManager == nil {
                // Return fees if we can't schedule
                feeVault!.deposit(from: <-fees)
                emit NextExecutionSchedulingFailed(planId: planId, reason: "Could not borrow scheduler manager")
                return false
            }

            // Schedule next execution using Manager.scheduleByHandler()
            // This is the key pattern from the scaffold
            let scheduledId = schedulerManager!.scheduleByHandler(
                handlerTypeIdentifier: self.getType().identifier,
                handlerUUID: self.uuid,
                data: nextTxData,
                timestamp: nextExecutionTime!,
                priority: loopConfig.priority,
                executionEffort: loopConfig.executionEffort,
                fees: <-fees as! @FlowToken.Vault
            )

            if scheduledId == 0 {
                emit NextExecutionSchedulingFailed(planId: planId, reason: "scheduleByHandler returned 0")
                return false
            }

            emit NextExecutionScheduled(planId: planId, scheduledId: scheduledId, timestamp: nextExecutionTime!)
            return true
        }

        init() {
            emit HandlerCreated(uuid: self.uuid)
        }
    }

    // ============================================================
    // Factory Functions
    // ============================================================

    access(all) fun createHandler(): @Handler {
        return <- create Handler()
    }

    access(all) fun createLoopConfig(
        schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>,
        feeProviderCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>,
        priority: FlowTransactionScheduler.Priority,
        executionEffort: UInt64
    ): LoopConfig {
        return LoopConfig(
            schedulerManagerCap: schedulerManagerCap,
            feeProviderCap: feeProviderCap,
            priority: priority,
            executionEffort: executionEffort
        )
    }

    access(all) fun createTransactionData(planId: UInt64, loopConfig: LoopConfig): TransactionData {
        return TransactionData(planId: planId, loopConfig: loopConfig)
    }

    // ============================================================
    // Init
    // ============================================================

    init() {
        self.HandlerStoragePath = /storage/DCAHandlerEVMV4
        self.HandlerPublicPath = /public/DCAHandlerEVMV4
    }
}
