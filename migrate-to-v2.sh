#!/bin/bash

# Migration script to upgrade from V1 to V2 controller on mainnet
# WARNING: This will destroy any existing DCA plans in your V1 controller

echo "=========================================="
echo "DCA Controller V1 → V2 Migration"
echo "=========================================="
echo ""
echo "⚠️  WARNING: This will destroy any existing V1 controller and plans!"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Migration cancelled."
    exit 0
fi

echo ""
echo "Running migration transaction..."
echo ""

# Create temporary transaction file
cat > /tmp/migrate-dca-v2.cdc << 'EOF'
import DCAControllerV2 from 0xca7ee55e4fc3251a
import FlowToken from 0x1654653399040a61
import FungibleToken from 0xf233dcee88fe0abe
import EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14 from 0x1e4aa0b87d10b141

transaction {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Remove old V1 controller if it exists (this will destroy it)
        if let oldController <- signer.storage.load<@AnyResource>(from: DCAControllerV2.ControllerStoragePath) {
            destroy oldController
            log("Removed old controller")
        }

        // Unpublish old capabilities
        signer.capabilities.unpublish(DCAControllerV2.ControllerPublicPath)

        // Initialize EVM bridged token vault if it doesn't exist
        let vaultStoragePath = /storage/evmVMBridgedTokenVault_f1815bd50389c46847f0bda824ec8da914045d14
        let vaultPublicPath = /public/evmVMBridgedTokenBalance_f1815bd50389c46847f0bda824ec8da914045d14
        let vaultReceiverPath = /public/evmVMBridgedTokenReceiver_f1815bd50389c46847f0bda824ec8da914045d14

        if signer.storage.borrow<&EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14.Vault>(
            from: vaultStoragePath
        ) == nil {
            // Create empty EVM bridged token vault
            let evmVault <- EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14.createEmptyVault(vaultType: Type<@EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14.Vault>())

            // Save vault to storage
            signer.storage.save(<-evmVault, to: vaultStoragePath)

            // Create public receiver capability
            let receiverCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(
                vaultStoragePath
            )
            signer.capabilities.publish(receiverCap, at: vaultReceiverPath)

            // Create public balance capability
            let balanceCap = signer.capabilities.storage.issue<&EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14.Vault>(
                vaultStoragePath
            )
            signer.capabilities.publish(balanceCap, at: vaultPublicPath)

            log("EVM bridged token vault initialized")
        }

        // Create NEW V2 controller
        let controller <- DCAControllerV2.createController()

        // Store controller at same path
        signer.storage.save(<-controller, to: DCAControllerV2.ControllerStoragePath)

        // Create public capability
        let cap = signer.capabilities.storage.issue<&DCAControllerV2.Controller>(
            DCAControllerV2.ControllerStoragePath
        )
        signer.capabilities.publish(cap, at: DCAControllerV2.ControllerPublicPath)

        // Borrow controller reference
        let controllerRef = signer.storage.borrow<&DCAControllerV2.Controller>(
            from: DCAControllerV2.ControllerStoragePath
        )!

        // Configure source vault capability (EVM bridged token)
        let sourceVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            vaultStoragePath
        )
        controllerRef.setSourceVaultCapability(cap: sourceVaultCap)

        // Configure target vault capability (FLOW)
        let targetVaultCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(
            /storage/flowTokenVault
        )
        controllerRef.setTargetVaultCapability(cap: targetVaultCap)

        // Configure fee vault capability (FLOW) for scheduler fees
        let feeVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            /storage/flowTokenVault
        )
        controllerRef.setFeeVaultCapability(cap: feeVaultCap)

        log("Successfully migrated to V2 controller")
    }
}
EOF

# Run the transaction
flow transactions send /tmp/migrate-dca-v2.cdc --network mainnet --signer mainnet-deployer

echo ""
echo "=========================================="
echo "Migration complete!"
echo "=========================================="
echo ""
echo "Your account now has a V2 controller."
echo "You can now create DCA plans using the V2 contracts."
