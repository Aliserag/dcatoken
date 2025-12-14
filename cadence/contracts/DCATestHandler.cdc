import FlowTransactionScheduler from "FlowTransactionScheduler"
import FlowTransactionSchedulerUtils from "FlowTransactionSchedulerUtils"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"

/// DCATestHandler: Simple Cadence-only test handler for scheduled transactions
///
/// This is a minimal test handler to verify the scheduled transaction pattern
/// works correctly BEFORE adding EVM complexity.
///
/// Pattern: Follows official scaffold (CounterLoopTransactionHandler)
/// - LoopConfig carries capabilities in TransactionData
/// - Handler uses Manager.scheduleByHandler() to reschedule
/// - No EVM calls - just logs and events
///
access(all) contract DCATestHandler {

    // ============================================================
    // Events
    // ============================================================

    access(all) event HandlerCreated(uuid: UInt64)
    access(all) event TestExecuted(executionId: UInt64, count: UInt64, timestamp: UFix64)
    access(all) event NextScheduled(executionId: UInt64, scheduledId: UInt64, timestamp: UFix64)
    access(all) event SchedulingFailed(executionId: UInt64, reason: String)
    access(all) event TestCompleted(executionId: UInt64, totalExecutions: UInt64)

    // ============================================================
    // Storage Paths
    // ============================================================

    access(all) let HandlerStoragePath: StoragePath
    access(all) let HandlerPublicPath: PublicPath

    // ============================================================
    // LoopConfig: Capabilities passed in TransactionData
    // ============================================================

    access(all) struct LoopConfig {
        access(all) let schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>
        access(all) let feeProviderCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>
        access(all) let priority: FlowTransactionScheduler.Priority
        access(all) let executionEffort: UInt64
        access(all) let intervalSeconds: UFix64
        access(all) let maxExecutions: UInt64

        init(
            schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>,
            feeProviderCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>,
            priority: FlowTransactionScheduler.Priority,
            executionEffort: UInt64,
            intervalSeconds: UFix64,
            maxExecutions: UInt64
        ) {
            self.schedulerManagerCap = schedulerManagerCap
            self.feeProviderCap = feeProviderCap
            self.priority = priority
            self.executionEffort = executionEffort
            self.intervalSeconds = intervalSeconds
            self.maxExecutions = maxExecutions
        }
    }

    // ============================================================
    // TransactionData
    // ============================================================

    access(all) struct TransactionData {
        access(all) let executionId: UInt64
        access(all) let currentCount: UInt64
        access(all) let loopConfig: LoopConfig

        init(executionId: UInt64, currentCount: UInt64, loopConfig: LoopConfig) {
            self.executionId = executionId
            self.currentCount = currentCount
            self.loopConfig = loopConfig
        }
    }

    // ============================================================
    // Handler Resource
    // ============================================================

    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {

        access(FlowTransactionScheduler.Execute)
        fun executeTransaction(id: UInt64, data: AnyStruct?) {
            let txData = data as? TransactionData
            if txData == nil {
                log("DCATestHandler: Invalid transaction data")
                return
            }

            let executionId = txData!.executionId
            let currentCount = txData!.currentCount
            let loopConfig = txData!.loopConfig
            let newCount = currentCount + 1

            log("DCATestHandler: Executing #".concat(newCount.toString()).concat(" of ").concat(loopConfig.maxExecutions.toString()))

            emit TestExecuted(
                executionId: executionId,
                count: newCount,
                timestamp: getCurrentBlock().timestamp
            )

            // Check if we should continue
            if newCount >= loopConfig.maxExecutions {
                emit TestCompleted(executionId: executionId, totalExecutions: newCount)
                log("DCATestHandler: Completed all executions")
                return
            }

            // Schedule next execution
            let nextTime = getCurrentBlock().timestamp + loopConfig.intervalSeconds
            let nextTxData = TransactionData(
                executionId: executionId,
                currentCount: newCount,
                loopConfig: loopConfig
            )

            // Estimate fees
            let estimate = FlowTransactionScheduler.estimate(
                data: nextTxData,
                timestamp: nextTime,
                priority: loopConfig.priority,
                executionEffort: loopConfig.executionEffort
            )

            let feeAmount = estimate.flowFee ?? 0.001
            let feeWithBuffer = feeAmount * 1.1

            // Borrow fee vault
            let feeVault = loopConfig.feeProviderCap.borrow()
            if feeVault == nil {
                emit SchedulingFailed(executionId: executionId, reason: "Could not borrow fee vault")
                return
            }

            if feeVault!.balance < feeWithBuffer {
                emit SchedulingFailed(executionId: executionId, reason: "Insufficient fees: ".concat(feeWithBuffer.toString()))
                return
            }

            let fees <- feeVault!.withdraw(amount: feeWithBuffer)

            // Borrow scheduler manager
            let schedulerManager = loopConfig.schedulerManagerCap.borrow()
            if schedulerManager == nil {
                feeVault!.deposit(from: <-fees)
                emit SchedulingFailed(executionId: executionId, reason: "Could not borrow scheduler manager")
                return
            }

            // Schedule next using Manager.scheduleByHandler()
            let scheduledId = schedulerManager!.scheduleByHandler(
                handlerTypeIdentifier: self.getType().identifier,
                handlerUUID: self.uuid,
                data: nextTxData,
                timestamp: nextTime,
                priority: loopConfig.priority,
                executionEffort: loopConfig.executionEffort,
                fees: <-fees as! @FlowToken.Vault
            )

            if scheduledId == 0 {
                emit SchedulingFailed(executionId: executionId, reason: "scheduleByHandler returned 0")
                return
            }

            emit NextScheduled(executionId: executionId, scheduledId: scheduledId, timestamp: nextTime)
            log("DCATestHandler: Scheduled next execution #".concat((newCount + 1).toString()).concat(" at ").concat(nextTime.toString()))
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
        executionEffort: UInt64,
        intervalSeconds: UFix64,
        maxExecutions: UInt64
    ): LoopConfig {
        return LoopConfig(
            schedulerManagerCap: schedulerManagerCap,
            feeProviderCap: feeProviderCap,
            priority: priority,
            executionEffort: executionEffort,
            intervalSeconds: intervalSeconds,
            maxExecutions: maxExecutions
        )
    }

    access(all) fun createTransactionData(
        executionId: UInt64,
        currentCount: UInt64,
        loopConfig: LoopConfig
    ): TransactionData {
        return TransactionData(
            executionId: executionId,
            currentCount: currentCount,
            loopConfig: loopConfig
        )
    }

    // ============================================================
    // Init
    // ============================================================

    init() {
        self.HandlerStoragePath = /storage/DCATestHandler
        self.HandlerPublicPath = /public/DCATestHandler
    }
}
