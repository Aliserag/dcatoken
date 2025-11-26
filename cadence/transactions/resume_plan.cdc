import "DCAController"

/// Resume DCA Plan
///
/// This transaction resumes a paused DCA plan.
///
/// Parameters:
/// - planId: ID of the plan to resume
/// - delaySeconds: Optional seconds until next execution (nil = use interval from now)
transaction(planId: UInt64, delaySeconds: UInt64?) {
    let controllerRef: &DCAController.Controller

    prepare(signer: auth(Storage) &Account) {
        self.controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) ?? panic("DCA Controller not found")
    }

    execute {
        let planRef = self.controllerRef.borrowPlan(id: planId)
            ?? panic("Plan not found with ID: ".concat(planId.toString()))

        let nextExecutionTime = delaySeconds != nil
            ? getCurrentBlock().timestamp + UFix64(delaySeconds!)
            : nil

        planRef.resume(nextExecutionTime: nextExecutionTime)

        log("Plan ".concat(planId.toString()).concat(" has been resumed"))
        if nextExecutionTime != nil {
            log("Next execution at: ".concat(nextExecutionTime!.toString()))
        }
    }
}
