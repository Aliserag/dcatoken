import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"
import DCAServiceEVM from "DCAServiceEVM"

/// Fund the shared COA with FLOW for EVM gas
/// This is needed for the COA to execute EVM transactions
///
transaction(amount: UFix64) {

    let flowVault: auth(FungibleToken.Withdraw) &FlowToken.Vault

    prepare(signer: auth(Storage) &Account) {
        self.flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("FlowToken vault not found")
    }

    execute {
        // Withdraw FLOW
        let vault <- self.flowVault.withdraw(amount: amount)

        // Deposit to COA
        DCAServiceEVM.depositGas(vault: <-vault)

        log("Funded COA with ".concat(amount.toString()).concat(" FLOW"))
        log("New COA balance: ".concat(DCAServiceEVM.getCOABalance().toString()))
    }
}
