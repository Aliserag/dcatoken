import DCAServiceEVM from "DCAServiceEVM"

/// Pause a DCA plan
/// Can be called by admin to pause a plan (stops future executions)
///
transaction(planId: UInt64) {

    prepare(signer: auth(Storage) &Account) {
        // In production, add proper access control
        // For now, only deployer/admin can pause plans
    }

    execute {
        DCAServiceEVM.pausePlan(planId: planId)
        log("Paused plan ".concat(planId.toString()))
    }
}
