import "FlowTransactionScheduler"
import "FlowTransactionSchedulerUtils"
import "FlowToken"
import "FungibleToken"

/// Schedule DCA Plan Execution
///
/// This transaction schedules a DCA plan execution via FlowTransactionScheduler.
/// The scheduler will call the DCATransactionHandler at the specified time.
///
/// Parameters:
/// - planId: ID of the plan to schedule
/// - delaySeconds: Seconds until execution (e.g., 300 for 5 minutes)
/// - priority: 0 = High, 1 = Medium, 2 = Low
/// - executionEffort: Gas/computation limit (e.g., 1000)
///
/// Prerequisites:
/// - DCA Controller initialized
/// - DCA Handler initialized
/// - Plan created
/// - Sufficient FLOW balance for scheduler fees
transaction(
    planId: UInt64,
    delaySeconds: UFix64,
    priority: UInt8,
    executionEffort: UInt64
) {
    prepare(signer: auth(BorrowValue, IssueStorageCapabilityController, SaveValue, GetStorageCapabilityController, PublishCapability) &Account) {
        // Calculate future execution time
        let future = getCurrentBlock().timestamp + delaySeconds

        // Convert priority to enum
        let pr = priority == 0
            ? FlowTransactionScheduler.Priority.High
            : priority == 1
                ? FlowTransactionScheduler.Priority.Medium
                : FlowTransactionScheduler.Priority.Low

        log("Scheduling DCA plan ".concat(planId.toString()).concat(" for execution at ").concat(future.toString()))
        log("Priority: ".concat(priority.toString()).concat(" (").concat(pr.rawValue.toString()).concat(")"))

        // Get the entitled capability for the handler
        // This capability allows FlowTransactionScheduler to call executeTransaction()
        var handlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>? = nil

        let controllers = signer.capabilities.storage.getControllers(forPath: /storage/DCATransactionHandler)
        assert(controllers.length > 0, message: "No handler found. Run init_dca_handler.cdc first")

        // Find the correct capability (with Execute entitlement)
        for controller in controllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}> {
                handlerCap = cap
                break
            }
        }

        assert(handlerCap != nil, message: "Could not find Execute-entitled handler capability")

        // Create or borrow manager
        if signer.storage.borrow<&AnyResource>(from: FlowTransactionSchedulerUtils.managerStoragePath) == nil {
            log("Creating new scheduler manager")
            let manager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-manager, to: FlowTransactionSchedulerUtils.managerStoragePath)

            // Create public capability for the manager
            let managerCapPublic = signer.capabilities.storage.issue<&{FlowTransactionSchedulerUtils.Manager}>(
                FlowTransactionSchedulerUtils.managerStoragePath
            )
            signer.capabilities.publish(managerCapPublic, at: FlowTransactionSchedulerUtils.managerPublicPath)
        }

        // Borrow the manager
        let manager = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("Could not borrow manager")

        // Prepare transaction data (planId will be passed to handler)
        let transactionData: {String: UInt64} = {"planId": planId}

        // Estimate fees
        let est = FlowTransactionScheduler.estimate(
            data: transactionData,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort
        )

        log("Estimated fee: ".concat((est.flowFee ?? 0.0).toString()).concat(" FLOW"))

        // Verify estimation succeeded
        assert(
            est.timestamp != nil || pr == FlowTransactionScheduler.Priority.Low,
            message: est.error ?? "Estimation failed"
        )

        // Withdraw fees
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Missing FlowToken vault")

        let feeAmount = est.flowFee ?? 0.0
        assert(vaultRef.balance >= feeAmount, message: "Insufficient FLOW balance for scheduler fees")

        let fees <- vaultRef.withdraw(amount: feeAmount) as! @FlowToken.Vault

        // Schedule through the manager
        let transactionId = manager.schedule(
            handlerCap: handlerCap!,
            data: transactionData,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort,
            fees: <-fees
        )

        log("✅ Scheduled transaction ID: ".concat(transactionId.toString()))
        log("   Plan ID: ".concat(planId.toString()))
        log("   Execution time: ".concat(future.toString()))
        log("   Block timestamp now: ".concat(getCurrentBlock().timestamp.toString()))
        log("")
        log("The DCA plan will execute automatically at the scheduled time.")
        log("Monitor execution with: flow scripts execute cadence/scripts/get_plan_details.cdc <address> ".concat(planId.toString()))
    }
}
