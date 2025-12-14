import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"

/// Fund the DCATestHandler fee vault with FLOW
///
/// Parameters:
/// - amount: Amount of FLOW to deposit (e.g., 0.1)
///
transaction(amount: UFix64) {

    let flowVault: auth(FungibleToken.Withdraw) &FlowToken.Vault
    let feeVault: &{FungibleToken.Receiver}

    prepare(signer: auth(Storage) &Account) {
        // Borrow FLOW vault
        self.flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("FlowToken vault not found")

        // Borrow test fee vault
        self.feeVault = signer.storage.borrow<&{FungibleToken.Receiver}>(
            from: /storage/DCATestFeeVault
        ) ?? panic("DCA Test Fee Vault not found. Run init_test_handler.cdc first.")
    }

    execute {
        let funding <- self.flowVault.withdraw(amount: amount)
        self.feeVault.deposit(from: <-funding)

        log("Funded DCA Test fee vault with ".concat(amount.toString()).concat(" FLOW"))
    }
}
