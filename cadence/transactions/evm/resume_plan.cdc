import DCAServiceEVM from "DCAServiceEVM"

/// Resume a paused DCA plan
/// Optionally specify when the next execution should occur
///
transaction(planId: UInt64, delaySeconds: UFix64?) {

    prepare(signer: auth(Storage) &Account) {
        // In production, add proper access control
    }

    execute {
        let nextExecutionTime: UFix64? = delaySeconds != nil
            ? getCurrentBlock().timestamp + delaySeconds!
            : nil

        DCAServiceEVM.resumePlan(planId: planId, nextExecTime: nextExecutionTime)
        log("Resumed plan ".concat(planId.toString()))
    }
}
