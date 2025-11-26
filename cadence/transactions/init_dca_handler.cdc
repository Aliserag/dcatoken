import "DCATransactionHandler"
import "DCAController"
import "FlowTransactionScheduler"

/// Initialize DCA Transaction Handler
///
/// This transaction creates and initializes a DCATransactionHandler for the signer.
/// The handler implements FlowTransactionScheduler.TransactionHandler and will be
/// called by the scheduler to execute DCA plans autonomously.
///
/// Prerequisites:
/// - DCAController must be initialized (run setup_controller.cdc first)
///
/// Steps:
/// 1. Get capability to user's DCAController
/// 2. Create DCATransactionHandler resource
/// 3. Save to storage
/// 4. Issue entitled capability for FlowTransactionScheduler
/// 5. Publish public capability for discoverability
transaction() {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Check if handler already exists
        if signer.storage.borrow<&DCATransactionHandler.Handler>(from: /storage/DCATransactionHandler) != nil {
            log("DCA Handler already exists")
            return
        }

        // Get controller capability with Owner entitlement
        let controllerCap = signer.capabilities.storage
            .issue<auth(DCAController.Owner) &DCAController.Controller>(
                DCAController.ControllerStoragePath
            )

        // Verify controller exists and capability is valid
        assert(controllerCap.check(), message: "Invalid controller capability. Run setup_controller.cdc first.")

        // Create handler resource
        let handler <- DCATransactionHandler.createHandler(controllerCap: controllerCap)

        // Save handler to storage
        signer.storage.save(<-handler, to: /storage/DCATransactionHandler)

        log("DCA Handler created and saved to storage")

        // Create entitled capability for FlowTransactionScheduler
        // This capability has Execute entitlement allowing scheduler to call executeTransaction()
        let handlerCapEntitled = signer.capabilities.storage
            .issue<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>(
                /storage/DCATransactionHandler
            )

        log("Entitled handler capability created for scheduler")

        // Publish public capability for discoverability
        // This allows anyone to see the handler exists but not execute it
        let handlerCapPublic = signer.capabilities.storage
            .issue<&{FlowTransactionScheduler.TransactionHandler}>(
                /storage/DCATransactionHandler
            )

        signer.capabilities.publish(handlerCapPublic, at: /public/DCATransactionHandler)

        log("Public handler capability published")
    }

    execute {
        log("DCA Transaction Handler initialization complete")
        log("Ready to schedule DCA plan executions")
    }
}
