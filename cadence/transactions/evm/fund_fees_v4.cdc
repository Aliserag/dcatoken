import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"

/// Fund the DCAHandlerEVMV4 fee vault with FLOW
///
/// Parameters:
/// - amount: Amount of FLOW to deposit (e.g., 1.0)
///
transaction(amount: UFix64) {

    let flowVault: auth(FungibleToken.Withdraw) &FlowToken.Vault
    let feeVault: &{FungibleToken.Receiver}

    prepare(signer: auth(Storage) &Account) {
        // Borrow FLOW vault
        self.flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("FlowToken vault not found")

        // Borrow V4 fee vault
        self.feeVault = signer.storage.borrow<&{FungibleToken.Receiver}>(
            from: /storage/DCAHandlerEVMV4FeeVault
        ) ?? panic("DCAHandlerEVMV4 Fee Vault not found. Run init_handler_v4.cdc first.")
    }

    execute {
        let funding <- self.flowVault.withdraw(amount: amount)
        self.feeVault.deposit(from: <-funding)

        log("Funded DCAHandlerEVMV4 fee vault with ".concat(amount.toString()).concat(" FLOW"))
    }
}
