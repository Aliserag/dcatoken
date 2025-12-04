import "DCATransactionHandlerV3"
import "DCAControllerV3"
import "FlowTransactionScheduler"

/// Initialize DCA Transaction Handler V3
///
/// This transaction creates and stores the scheduled transaction handler
/// that will execute DCA plans autonomously on Flow EVM DEXes.
///
/// Prerequisites:
/// - Controller must be set up first (run setup_controller_v3.cdc)
///
transaction {

    prepare(signer: auth(Storage, Capabilities, IssueStorageCapabilityController, SaveValue) &Account) {

        // Check if handler already exists
        if signer.storage.type(at: /storage/DCATransactionHandlerV3) != nil {
            log("Handler already exists")
            return
        }

        // Verify controller exists
        if signer.storage.type(at: DCAControllerV3.ControllerStoragePath) == nil {
            panic("DCA Controller not found. Please run setup_controller_v3.cdc first.")
        }

        // Issue controller capability with Owner entitlement for handler
        let controllerCap = signer.capabilities.storage.issue<auth(DCAControllerV3.Owner) &DCAControllerV3.Controller>(
            DCAControllerV3.ControllerStoragePath
        )

        // Create handler with controller capability
        let handler <- DCATransactionHandlerV3.createHandler(
            controllerCap: controllerCap
        )

        // Save handler to storage
        signer.storage.save(<-handler, to: /storage/DCATransactionHandlerV3)

        log("DCA Transaction Handler V3 created successfully")
    }

    execute {
        // Verify handler was created
        // This is done in post conditions
    }

    post {
        getAccount(signer.address).storage.type(at: /storage/DCATransactionHandlerV3) != nil:
            "Handler was not saved to storage"
    }
}
