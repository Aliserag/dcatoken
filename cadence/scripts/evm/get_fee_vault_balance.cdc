import FlowToken from "FlowToken"

/// Get the balance of the DCAHandlerEVMV4 fee vault
///
/// Parameters:
/// - serviceAddress: The address where DCAHandlerEVMV4 is deployed
///
access(all) fun main(serviceAddress: Address): UFix64 {
    let account = getAccount(serviceAddress)

    let feeVaultRef = account.storage.borrow<&FlowToken.Vault>(
        from: /storage/DCAHandlerEVMV4FeeVault
    )

    if feeVaultRef == nil {
        // Fee vault doesn't exist - return 0.0
        return 0.0
    }

    return feeVaultRef!.balance
}
