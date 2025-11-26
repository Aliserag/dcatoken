import "ScheduledHandler"
import "DCATransactionHandler"

/// Manually Execute DCA Plan
///
/// This transaction manually triggers execution of a DCA plan using the handler.
/// Useful for testing or triggering executions outside the scheduled system.
///
/// In production, plans are executed automatically by the Scheduled Transaction
/// system. This transaction is primarily for emulator testing and emergency
/// manual execution.
///
/// Parameters:
/// - ownerAddress: Address of the plan owner
/// - planId: ID of the plan to execute
///
/// Note: The transaction data format must match what the handler expects
transaction(ownerAddress: Address, planId: UInt64) {
    prepare(signer: auth(Storage) &Account) {
        // No preparation needed - handler accesses everything via public capabilities
    }

    execute {
        log("Manually executing DCA plan ".concat(planId.toString()).concat(" for owner ").concat(ownerAddress.toString()))

        // Get the handler from owner's account
        let handlerCap = getAccount(ownerAddress).capabilities
            .get<&{FlowTransactionScheduler.TransactionHandler}>(/public/DCATransactionHandler)

        assert(handlerCap.check(), message: "Handler not found or not accessible")

        let handler = handlerCap.borrow() ?? panic("Could not borrow handler")

        // Prepare transaction data (same format as scheduler would use)
        let transactionData: {String: UInt64} = {"planId": planId}

        // Call executeTransaction (simulating what scheduler would do)
        // Note: This requires Execute entitlement which we don't have in manual mode
        // So this will fail unless we modify the handler or use a different approach

        log("⚠️  Note: Manual execution requires Execute entitlement")
        log("    For testing, consider using a test transaction that calls the swap logic directly")
        log("    Or wait for scheduled execution to occur")

        // Alternative: For testing, we could add a public test function to the handler
        // But that would compromise security in production

        panic("Manual execution not supported without Execute entitlement. Use scheduled execution instead.")
    }
}
