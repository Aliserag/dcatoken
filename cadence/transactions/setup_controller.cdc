import "DCAController"
import "FlowToken"
import "FungibleToken"

/// Setup DCA Controller
///
/// This transaction initializes a DCAController for the signer.
/// It should be run once per user before creating any DCA plans.
///
/// Steps:
/// 1. Create new Controller resource
/// 2. Save to storage
/// 3. Link public capability
/// 4. Configure vault capabilities for FLOW (source) and Beaver (target)
///
/// Required: User must have FlowToken vault initialized
transaction() {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Check if controller already exists
        if signer.storage.borrow<&DCAController.Controller>(from: DCAController.ControllerStoragePath) != nil {
            log("Controller already exists")
            return
        }

        // Create new controller
        let controller <- DCAController.createController()

        // Save to storage
        signer.storage.save(<-controller, to: DCAController.ControllerStoragePath)

        // Create public capability
        let controllerCap = signer.capabilities.storage.issue<&DCAController.Controller>(
            DCAController.ControllerStoragePath
        )
        signer.capabilities.publish(controllerCap, at: DCAController.ControllerPublicPath)

        log("DCA Controller created successfully")

        // Configure source vault capability (FLOW)
        let sourceVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            /storage/flowTokenVault
        )

        let controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) ?? panic("Could not borrow controller reference")

        controllerRef.setSourceVaultCapability(cap: sourceVaultCap)

        log("Source vault capability configured for FLOW")

        // Note: Target vault capability (Beaver) should be configured
        // after Beaver vault is initialized. See setup_beaver_vault.cdc
    }

    execute {
        log("DCA Controller setup complete")
    }
}
