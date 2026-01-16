import DCAHandlerEVMV4 from "DCAHandlerEVMV4"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"

/// Check if DCAHandlerEVMV4 is properly initialized
/// Returns information about handler setup status
///
access(all) fun main(serviceAddress: Address): {String: AnyStruct} {
    let account = getAccount(serviceAddress)

    var result: {String: AnyStruct} = {}

    // Check if fee vault exists
    let feeVaultRef = account.storage.borrow<&FlowToken.Vault>(
        from: /storage/DCAHandlerEVMV4FeeVault
    )

    if feeVaultRef != nil {
        result["feeVaultExists"] = true
        result["feeVaultBalance"] = feeVaultRef!.balance
    } else {
        result["feeVaultExists"] = false
        result["feeVaultBalance"] = 0.0
    }

    // Check for handler capabilities
    let handlerControllers = account.capabilities.storage.getControllers(
        forPath: DCAHandlerEVMV4.HandlerStoragePath
    )
    result["handlerCapabilityCount"] = handlerControllers.length

    // Check for manager capabilities
    let managerPath = StoragePath(identifier: "FlowTransactionSchedulerUtilsManager")!
    let managerControllers = account.capabilities.storage.getControllers(
        forPath: managerPath
    )
    result["managerCapabilityCount"] = managerControllers.length

    // Overall status
    let initialized = feeVaultRef != nil &&
                     handlerControllers.length > 0 &&
                     managerControllers.length > 0

    result["initialized"] = initialized
    result["status"] = initialized ? "READY" : "NOT_INITIALIZED"

    if !initialized {
        var missing: [String] = []
        if feeVaultRef == nil {
            missing.append("Fee Vault")
        }
        if handlerControllers.length == 0 {
            missing.append("Handler Capability")
        }
        if managerControllers.length == 0 {
            missing.append("Manager Capability")
        }
        result["missingComponents"] = missing
    }

    return result
}
