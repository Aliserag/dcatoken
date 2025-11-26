import "ScheduledHandler"

/// Manually Execute DCA Plan
///
/// This transaction manually triggers execution of a DCA plan.
/// Useful for testing or triggering executions outside the scheduled system.
///
/// In production, plans are executed automatically by the Scheduled Transaction
/// system. This transaction is primarily for emulator testing and emergency
/// manual execution.
///
/// Parameters:
/// - ownerAddress: Address of the plan owner
/// - planId: ID of the plan to execute
transaction(ownerAddress: Address, planId: UInt64) {
    prepare(signer: auth(Storage) &Account) {
        // No preparation needed - handler accesses everything via public capabilities
    }

    execute {
        log("Manually executing plan ".concat(planId.toString()).concat(" for owner ").concat(ownerAddress.toString()))

        // Call the scheduled handler
        ScheduledHandler.executeDCA(ownerAddress: ownerAddress, planId: planId)

        log("Execution completed")
    }
}
