import "DCAControllerV3"
import "FungibleToken"
import "FlowToken"
import "EVM"
import EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed from 0x1e4aa0b87d10b141

/// Setup DCA Controller V3 with token vault capabilities and COA
///
/// This transaction initializes the user's DCA controller for EVM-based swaps.
/// It configures capabilities for FLOW (source) and USDF (target) tokens,
/// plus the COA capability for EVM execution.
///
/// Prerequisites:
/// - COA must be created first (run setup_coa.cdc)
/// - User must have FLOW vault at /storage/flowTokenVault
/// - User must have USDF vault at /storage/EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed
///
transaction {

    prepare(signer: auth(Storage, Capabilities, IssueStorageCapabilityController, PublishCapability, SaveValue) &Account) {

        // Check if controller already exists
        if signer.storage.type(at: DCAControllerV3.ControllerStoragePath) != nil {
            log("Controller already exists")
            return
        }

        // Create controller
        let controller <- DCAControllerV3.createController()

        // ========================================
        // Setup Source Vault Capability (FLOW)
        // ========================================

        // Issue private capability for FLOW vault with Withdraw auth
        let flowVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            /storage/flowTokenVault
        )

        // Set source vault capability on controller
        controller.setSourceVaultCapability(cap: flowVaultCap)

        // ========================================
        // Setup Target Vault Capability (USDF)
        // ========================================

        // Check if USDF vault exists, create if needed
        if signer.storage.type(at: /storage/EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed) == nil {
            // Create USDF vault
            let usdfVault <- EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed.createEmptyVault(
                vaultType: Type<@EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed.Vault>()
            )
            signer.storage.save(<-usdfVault, to: /storage/EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed)

            // Publish receiver capability
            let usdfReceiverCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(
                /storage/EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed
            )
            signer.capabilities.publish(usdfReceiverCap, at: /public/EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed_receiver)

            log("USDF vault created")
        }

        // Issue capability for USDF vault receiver
        let usdfReceiverCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(
            /storage/EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed
        )

        // Set target vault capability on controller
        controller.setTargetVaultCapability(cap: usdfReceiverCap)

        // ========================================
        // Setup Fee Vault Capability (FLOW)
        // ========================================

        // Use same FLOW vault for fees
        let feeVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            /storage/flowTokenVault
        )

        controller.setFeeVaultCapability(cap: feeVaultCap)

        // ========================================
        // Setup COA Capability
        // ========================================

        // Verify COA exists
        if signer.storage.type(at: /storage/evm) == nil {
            panic("COA not found. Please run setup_coa.cdc first.")
        }

        // Issue capability for COA with owner auth
        let coaCap = signer.capabilities.storage.issue<auth(EVM.Owner) &EVM.CadenceOwnedAccount>(
            /storage/evm
        )

        // Set COA capability on controller
        controller.setCOACapability(cap: coaCap)

        // ========================================
        // Save Controller
        // ========================================

        signer.storage.save(<-controller, to: DCAControllerV3.ControllerStoragePath)

        // Publish controller capability
        let controllerCap = signer.capabilities.storage.issue<&DCAControllerV3.Controller>(
            DCAControllerV3.ControllerStoragePath
        )
        signer.capabilities.publish(controllerCap, at: DCAControllerV3.ControllerPublicPath)

        log("DCA Controller V3 created and configured successfully")
    }

    execute {
        // Verify controller was created and is fully configured
        // This is done in post conditions
    }

    post {
        getAccount(signer.address).storage.type(at: DCAControllerV3.ControllerStoragePath) != nil:
            "Controller was not saved to storage"
    }
}
