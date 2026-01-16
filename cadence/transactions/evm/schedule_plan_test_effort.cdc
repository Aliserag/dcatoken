import FlowTransactionScheduler from "FlowTransactionScheduler"
import FlowTransactionSchedulerUtils from "FlowTransactionSchedulerUtils"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"
import DCAHandlerEVMV4 from "DCAHandlerEVMV4"
import DCAServiceEVM from "DCAServiceEVM"

/// Schedule a DCA plan with CONFIGURABLE executionEffort for testing
///
/// This is a test version that accepts executionEffort as a parameter
/// to find the minimum required for EVM swaps.
///
/// Parameters:
/// - planId: The DCA plan ID to schedule
/// - executionEffort: The compute effort to allocate (e.g., 500, 1000, 2000, 5000)
///
transaction(planId: UInt64, executionEffort: UInt64) {

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

        // Get plan to verify it exists and get first execution time
        let plan = DCAServiceEVM.getPlan(planId: planId)
            ?? panic("Plan not found")

        if plan.nextExecutionTime == nil {
            panic("Plan has no next execution time set")
        }
        self.firstExecutionTime = plan.nextExecutionTime!

        // === Use getControllers() to retrieve EXISTING capabilities ===

        // 1. Get Handler capability (entitled)
        var foundHandlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>? = nil
        let handlerControllers = signer.capabilities.storage.getControllers(forPath: DCAHandlerEVMV4.HandlerStoragePath)

        for controller in handlerControllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}> {
                if cap.check() {
                    foundHandlerCap = cap
                    break
                }
            }
        }

        self.handlerCap = foundHandlerCap ?? panic("No valid handler capability found. Run init_handler_v4.cdc first.")

        // 2. Get Manager capability
        var foundManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>? = nil
        let managerControllers = signer.capabilities.storage.getControllers(forPath: FlowTransactionSchedulerUtils.managerStoragePath)

        for controller in managerControllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}> {
                if cap.check() {
                    foundManagerCap = cap
                    break
                }
            }
        }

        self.managerCap = foundManagerCap ?? panic("No valid manager capability found. Run init_handler_v4.cdc first.")

        // 3. Get Fee Vault capability
        var foundFeeVaultCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>? = nil
        let feeVaultControllers = signer.capabilities.storage.getControllers(forPath: /storage/DCAHandlerEVMV4FeeVault)

        for controller in feeVaultControllers {
            if let cap = controller.capability as? Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault> {
                if cap.check() {
                    foundFeeVaultCap = cap
                    break
                }
            }
        }

        self.feeProviderCap = foundFeeVaultCap ?? panic("No valid fee vault capability found. Run init_handler_v4.cdc first.")
    }

    execute {
        let priority = FlowTransactionScheduler.Priority.Medium

        // Create LoopConfig with CONFIGURABLE executionEffort
        let loopConfig = DCAHandlerEVMV4.createLoopConfig(
            schedulerManagerCap: self.managerCap,
            feeProviderCap: self.feeProviderCap,
            priority: priority,
            executionEffort: executionEffort  // <-- CONFIGURABLE
        )

        // Create transaction data with LoopConfig
        let txData = DCAHandlerEVMV4.createTransactionData(
            planId: planId,
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
        log("=== EFFORT TEST: Scheduling DCA plan ===")
        log("  Plan ID: ".concat(planId.toString()))
        log("  Execution Effort: ".concat(executionEffort.toString()))
        log("  First execution: ".concat(self.firstExecutionTime.toString()))
        log("  Fee: ".concat(feeAmount.toString()))

        // Borrow the Manager and schedule through it
        let manager = self.managerCap.borrow()
            ?? panic("Could not borrow scheduler manager")

        // Schedule using Manager.schedule()
        let scheduledId = manager.schedule(
            handlerCap: self.handlerCap,
            data: txData as AnyStruct,
            timestamp: self.firstExecutionTime,
            priority: priority,
            executionEffort: executionEffort,
            fees: <- fees
        )

        log("")
        log("SUCCESS: DCA plan scheduled with effort ".concat(executionEffort.toString()))
        log("  Scheduled ID: ".concat(scheduledId.toString()))
    }
}
