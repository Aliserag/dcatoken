import DCAServiceEVM from "DCAServiceEVM"

/// Cancel a DCA plan
/// This permanently cancels the plan (cannot be resumed)
///
transaction(planId: UInt64) {

    prepare(signer: auth(Storage) &Account) {
        // In production, add proper access control
    }

    execute {
        DCAServiceEVM.cancelPlan(planId: planId)
        log("Cancelled plan ".concat(planId.toString()))
    }
}
