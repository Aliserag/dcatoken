import FlowTransactionScheduler from "FlowTransactionScheduler"
import FlowTransactionSchedulerUtils from "FlowTransactionSchedulerUtils"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"
import DCAHandlerEVMV4 from "DCAHandlerEVMV4"
import Burner from "Burner"

/// Reset and reinitialize the DCAHandlerEVMV4
/// This removes the old handler and creates a new one with the correct contract reference
///
transaction() {

    prepare(signer: auth(Storage, Capabilities) &Account) {

        // 1. Remove old handler if exists
        let handlerPath = DCAHandlerEVMV4.HandlerStoragePath
        if let oldHandler <- signer.storage.load<@AnyResource>(from: handlerPath) {
            Burner.burn(<-oldHandler)
            log("Removed old handler")
        }

        // 2. Unpublish old public capability
        signer.capabilities.unpublish(DCAHandlerEVMV4.HandlerPublicPath)
        log("Unpublished old public capability")

        // 3. Create new Handler
        let handler <- DCAHandlerEVMV4.createHandler()
        signer.storage.save(<-handler, to: handlerPath)
        log("Created new DCAHandlerEVMV4")

        // 4. Issue ENTITLED capability (auth(Execute))
        let entitledCap = signer.capabilities.storage.issue<
            auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}
        >(handlerPath)
        log("Issued entitled capability ID: ".concat(entitledCap.id.toString()))

        // 5. Issue NON-ENTITLED public capability and publish
        let publicCap = signer.capabilities.storage.issue<
            &{FlowTransactionScheduler.TransactionHandler}
        >(handlerPath)
        signer.capabilities.publish(publicCap, at: DCAHandlerEVMV4.HandlerPublicPath)
        log("Published public capability")

        // 6. Ensure Manager exists
        let managerPath = FlowTransactionSchedulerUtils.managerStoragePath
        if signer.storage.type(at: managerPath) == nil {
            let manager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-manager, to: managerPath)
            log("Created Scheduler Manager")
        } else {
            log("Manager already exists")
        }

        // 7. Issue new Manager capability
        let managerCap = signer.capabilities.storage.issue<
            auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}
        >(managerPath)
        log("Issued manager capability ID: ".concat(managerCap.id.toString()))

        // 8. Ensure Fee Vault exists
        let feeVaultPath = /storage/DCAHandlerEVMV4FeeVault
        if signer.storage.type(at: feeVaultPath) == nil {
            let feeVault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
            signer.storage.save(<-feeVault, to: feeVaultPath)
            log("Created Fee Vault")
        } else {
            log("Fee Vault already exists")
        }

        // 9. Issue new Fee Vault capability
        let feeVaultCap = signer.capabilities.storage.issue<
            auth(FungibleToken.Withdraw) &FlowToken.Vault
        >(feeVaultPath)
        log("Issued fee vault capability ID: ".concat(feeVaultCap.id.toString()))

        log("")
        log("SUCCESS: DCAHandlerEVMV4 reset with new contract reference")
    }

    execute {
        // Nothing to do in execute
    }
}
