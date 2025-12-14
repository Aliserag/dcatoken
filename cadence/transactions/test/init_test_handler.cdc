import FlowTransactionScheduler from "FlowTransactionScheduler"
import FlowTransactionSchedulerUtils from "FlowTransactionSchedulerUtils"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"
import DCATestHandler from "DCATestHandler"

/// Initialize the DCATestHandler with dual capabilities
///
/// This follows the official scaffold pattern:
/// 1. Create Handler resource
/// 2. Issue ENTITLED capability (for Execute entitlement)
/// 3. Issue NON-ENTITLED public capability
/// 4. Create Manager if needed
/// 5. Create Fee Vault for scheduling fees
///
transaction() {

    prepare(signer: auth(Storage, Capabilities) &Account) {

        // 1. Create Handler if not exists
        let handlerPath = DCATestHandler.HandlerStoragePath
        if signer.storage.type(at: handlerPath) == nil {
            let handler <- DCATestHandler.createHandler()
            signer.storage.save(<-handler, to: handlerPath)
            log("Created DCATestHandler")
        } else {
            log("Handler already exists")
        }

        // 2. Issue ENTITLED capability (auth(Execute))
        // This is required for the scheduler to call executeTransaction
        let entitledCap = signer.capabilities.storage.issue<
            auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}
        >(handlerPath)
        log("Issued entitled capability ID: ".concat(entitledCap.id.toString()))

        // 3. Issue NON-ENTITLED public capability and publish
        let publicCap = signer.capabilities.storage.issue<
            &{FlowTransactionScheduler.TransactionHandler}
        >(handlerPath)
        signer.capabilities.publish(publicCap, at: DCATestHandler.HandlerPublicPath)
        log("Published public capability")

        // 4. Create Manager if not exists
        let managerPath = FlowTransactionSchedulerUtils.managerStoragePath
        if signer.storage.type(at: managerPath) == nil {
            let manager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-manager, to: managerPath)
            log("Created Scheduler Manager")
        } else {
            log("Manager already exists")
        }

        // 5. Issue Manager capability (for LoopConfig)
        let managerCap = signer.capabilities.storage.issue<
            auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}
        >(managerPath)
        log("Issued manager capability ID: ".concat(managerCap.id.toString()))

        // 6. Create Fee Vault if not exists
        let feeVaultPath = /storage/DCATestFeeVault
        if signer.storage.type(at: feeVaultPath) == nil {
            let feeVault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
            signer.storage.save(<-feeVault, to: feeVaultPath)
            log("Created Fee Vault")
        } else {
            log("Fee Vault already exists")
        }

        // 7. Issue Fee Vault capability (for LoopConfig)
        let feeVaultCap = signer.capabilities.storage.issue<
            auth(FungibleToken.Withdraw) &FlowToken.Vault
        >(feeVaultPath)
        log("Issued fee vault capability ID: ".concat(feeVaultCap.id.toString()))

        log("")
        log("SUCCESS: DCATestHandler initialized with dual capabilities")
        log("- Handler at: ".concat(handlerPath.toString()))
        log("- Manager at: ".concat(managerPath.toString()))
        log("- Fee Vault at: ".concat(feeVaultPath.toString()))
    }

    execute {
        // Nothing to do in execute
    }
}
