import "DCAController"

/// Pause DCA Plan
///
/// This transaction pauses an active DCA plan, preventing further executions
/// until it is resumed.
///
/// Parameters:
/// - planId: ID of the plan to pause
transaction(planId: UInt64) {
    let controllerRef: &DCAController.Controller

    prepare(signer: auth(Storage) &Account) {
        self.controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) ?? panic("DCA Controller not found")
    }

    execute {
        let planRef = self.controllerRef.borrowPlan(id: planId)
            ?? panic("Plan not found with ID: ".concat(planId.toString()))

        planRef.pause()

        log("Plan ".concat(planId.toString()).concat(" has been paused"))
    }
}
