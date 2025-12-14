import EVM from "EVM"
import FungibleToken from "FungibleToken"
import FlowToken from "FlowToken"

/// Setup a Cadence-Owned Account (COA) for a Cadence user
///
/// This creates a COA resource that allows Cadence users to interact with EVM.
/// The COA is stored in the user's account and can be used to:
/// - Hold EVM tokens (WFLOW, USDF, etc.)
/// - Sign EVM transactions
/// - Approve ERC-20 spending
///
/// Parameters:
/// - initialFunding: Optional FLOW to fund the COA for EVM gas (e.g., 0.1)
///
transaction(initialFunding: UFix64?) {

    let coa: auth(EVM.Call) &EVM.CadenceOwnedAccount

    prepare(signer: auth(Storage, Capabilities, BorrowValue) &Account) {
        // Check if COA already exists
        let coaPath = /storage/evm

        if signer.storage.type(at: coaPath) == nil {
            // Create new COA
            let newCOA <- EVM.createCadenceOwnedAccount()
            signer.storage.save(<-newCOA, to: coaPath)
            log("Created new COA")

            // Issue and publish capability for borrowing
            let cap = signer.capabilities.storage.issue<&EVM.CadenceOwnedAccount>(coaPath)
            signer.capabilities.publish(cap, at: /public/evm)
            log("Published COA capability")
        } else {
            log("COA already exists")
        }

        // Borrow COA reference
        self.coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(from: coaPath)
            ?? panic("Could not borrow COA")

        // Fund COA if requested
        if initialFunding != nil && initialFunding! > 0.0 {
            let flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
                from: /storage/flowTokenVault
            ) ?? panic("Could not borrow FlowToken vault")

            let funding <- flowVault.withdraw(amount: initialFunding!) as! @FlowToken.Vault
            self.coa.deposit(from: <-funding)
            log("Funded COA with ".concat(initialFunding!.toString()).concat(" FLOW"))
        }
    }

    execute {
        let evmAddress = self.coa.address()
        log("")
        log("COA Setup Complete!")
        log("EVM Address: ".concat(evmAddress.toString()))
        log("")
        log("You can now:")
        log("- Wrap FLOW to WFLOW using wrap_flow.cdc")
        log("- Approve the DCA service using approve_dca.cdc")
    }
}
