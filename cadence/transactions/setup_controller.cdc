import "DCAController"
import "FlowToken"
import "FungibleToken"
import TeleportedTetherToken from 0xcfdd90d4a00f7b5b

/// Setup DCA Controller
///
/// This transaction initializes a DCAController for the signer.
/// It should be run once per user before creating any DCA plans.
///
/// Steps:
/// 1. Create new Controller resource
/// 2. Save to storage
/// 3. Link public capability
/// 4. Configure vault capabilities for USDT (source) and FLOW (target)
///
/// Required: User must have USDT and FLOW vaults initialized
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

        // Configure source vault capability (USDT)
        // This allows DCA plans to withdraw USDT for swapping to FLOW
        let sourceVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            /storage/teleportedTetherTokenVault
        )

        let controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) ?? panic("Could not borrow controller reference")

        controllerRef.setSourceVaultCapability(cap: sourceVaultCap)

        log("Source vault capability configured for USDT")

        // Configure target vault capability (FLOW)
        // This allows DCA plans to deposit the FLOW received from swaps
        let targetVaultCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(
            /storage/flowTokenVault
        )
        controllerRef.setTargetVaultCapability(cap: targetVaultCap)

        log("Target vault capability configured for FLOW")
    }

    execute {
        log("DCA Controller setup complete for USDT → FLOW DCA")
    }
}
