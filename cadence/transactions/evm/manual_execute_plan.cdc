import DCAServiceEVM from "DCAServiceEVM"

/// Manual Execute Plan - Bypass Scheduler for Testing
///
/// This transaction directly calls DCAServiceEVM.executePlan()
/// to test if the swap logic works independently of the scheduler.
///
/// Use this to diagnose whether issues are with:
/// - The swap logic (if this fails)
/// - The scheduler (if this works but scheduled execution doesn't)
///
transaction(planId: UInt64) {

    prepare(signer: auth(Storage) &Account) {
        // No special permissions needed - executePlan is public
    }

    execute {
        // Get plan details before execution
        let planBefore = DCAServiceEVM.getPlan(planId: planId)
        if planBefore == nil {
            panic("Plan not found: ".concat(planId.toString()))
        }

        log("=== Manual Execution Test ===")
        log("Plan ID: ".concat(planId.toString()))
        log("Status before: ".concat(planBefore!.statusRaw.toString()))
        log("Execution count before: ".concat(planBefore!.executionCount.toString()))
        log("Amount per interval: ".concat(planBefore!.amountPerInterval.toString()))

        // Execute the plan
        let success = DCAServiceEVM.executePlan(planId: planId)

        log("")
        log("Execution result: ".concat(success ? "SUCCESS" : "FAILED"))

        // Get plan details after execution
        let planAfter = DCAServiceEVM.getPlan(planId: planId)
        if planAfter != nil {
            log("")
            log("=== After Execution ===")
            log("Status after: ".concat(planAfter!.statusRaw.toString()))
            log("Execution count after: ".concat(planAfter!.executionCount.toString()))
            log("Total source spent: ".concat(planAfter!.totalSourceSpent.toString()))
            log("Total target received: ".concat(planAfter!.totalTargetReceived.toString()))
        }
    }
}
