import FlowTransactionScheduler from "FlowTransactionScheduler"
import FlowTransactionSchedulerUtils from "FlowTransactionSchedulerUtils"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"
import DCATestHandler from "DCATestHandler"

/// Schedule a test loop using the correct scaffold pattern
///
/// This uses getControllers() to retrieve EXISTING capabilities
/// instead of issuing new ones each time.
///
/// Parameters:
/// - intervalSeconds: Time between executions (e.g., 30.0 for 30 seconds)
/// - maxExecutions: Number of times to execute (e.g., 3)
///
transaction(intervalSeconds: UFix64, maxExecutions: UInt64) {

    let flowVault: auth(FungibleToken.Withdraw) &FlowToken.Vault
    let handlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>
    let managerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>
    let feeProviderCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>
    let firstExecutionTime: UFix64

    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Get FLOW vault for initial scheduling fee
        self.flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("FlowToken vault not found")

        self.firstExecutionTime = getCurrentBlock().timestamp + intervalSeconds

        // === Use getControllers() to retrieve EXISTING capabilities ===
        // This is the KEY difference from V3 which issued new caps each time

        // 1. Get Handler capability (entitled)
        var foundHandlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>? = nil
        let handlerControllers = signer.capabilities.storage.getControllers(forPath: DCATestHandler.HandlerStoragePath)
        log("Found ".concat(handlerControllers.length.toString()).concat(" handler capability controllers"))

        for controller in handlerControllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}> {
                if cap.check() {
                    foundHandlerCap = cap
                    log("Found valid entitled handler capability ID: ".concat(cap.id.toString()))
                    break
                }
            }
        }

        self.handlerCap = foundHandlerCap ?? panic("No valid handler capability found. Run init_test_handler.cdc first.")

        // 2. Get Manager capability
        var foundManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>? = nil
        let managerControllers = signer.capabilities.storage.getControllers(forPath: FlowTransactionSchedulerUtils.managerStoragePath)
        log("Found ".concat(managerControllers.length.toString()).concat(" manager capability controllers"))

        for controller in managerControllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}> {
                if cap.check() {
                    foundManagerCap = cap
                    log("Found valid manager capability ID: ".concat(cap.id.toString()))
                    break
                }
            }
        }

        self.managerCap = foundManagerCap ?? panic("No valid manager capability found. Run init_test_handler.cdc first.")

        // 3. Get Fee Vault capability
        var foundFeeVaultCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>? = nil
        let feeVaultControllers = signer.capabilities.storage.getControllers(forPath: /storage/DCATestFeeVault)
        log("Found ".concat(feeVaultControllers.length.toString()).concat(" fee vault capability controllers"))

        for controller in feeVaultControllers {
            if let cap = controller.capability as? Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault> {
                if cap.check() {
                    foundFeeVaultCap = cap
                    log("Found valid fee vault capability ID: ".concat(cap.id.toString()))
                    break
                }
            }
        }

        self.feeProviderCap = foundFeeVaultCap ?? panic("No valid fee vault capability found. Run init_test_handler.cdc first.")
    }

    execute {
        let executionEffort: UInt64 = 2000
        let priority = FlowTransactionScheduler.Priority.Medium

        // Create LoopConfig with retrieved capabilities
        let loopConfig = DCATestHandler.createLoopConfig(
            schedulerManagerCap: self.managerCap,
            feeProviderCap: self.feeProviderCap,
            priority: priority,
            executionEffort: executionEffort,
            intervalSeconds: intervalSeconds,
            maxExecutions: maxExecutions
        )

        // Create unique execution ID based on block height
        let executionId = getCurrentBlock().height

        // Create transaction data with LoopConfig
        let txData = DCATestHandler.createTransactionData(
            executionId: executionId,
            currentCount: 0,
            loopConfig: loopConfig
        )

        // Estimate fees
        let feeEstimate = FlowTransactionScheduler.estimate(
            data: txData as AnyStruct,
            timestamp: self.firstExecutionTime,
            priority: priority,
            executionEffort: executionEffort
        )

        let estimatedFee = feeEstimate.flowFee ?? 0.001
        let feeAmount = estimatedFee * 1.1
        let fees <- self.flowVault.withdraw(amount: feeAmount) as! @FlowToken.Vault

        log("")
        log("Scheduling test loop:")
        log("  Execution ID: ".concat(executionId.toString()))
        log("  Interval: ".concat(intervalSeconds.toString()).concat(" seconds"))
        log("  Max executions: ".concat(maxExecutions.toString()))
        log("  First execution: ".concat(self.firstExecutionTime.toString()))
        log("  Fee: ".concat(feeAmount.toString()))

        // Borrow the Manager and schedule through it (following official scaffold pattern)
        let manager = self.managerCap.borrow()
            ?? panic("Could not borrow scheduler manager")

        // Schedule using Manager.schedule() - this handles the ScheduledTransaction internally
        let scheduledId = manager.schedule(
            handlerCap: self.handlerCap,
            data: txData as AnyStruct,
            timestamp: self.firstExecutionTime,
            priority: priority,
            executionEffort: executionEffort,
            fees: <- fees
        )

        log("")
        log("SUCCESS: Test scheduled via Manager!")
        log("  Scheduled ID: ".concat(scheduledId.toString()))
    }
}
