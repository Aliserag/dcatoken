import "EVM"
import "FungibleToken"
import "FlowToken"

/// Setup a Cadence Owned Account (COA) for EVM interactions
/// This is required before using EVM DEXes for DCA swaps
///
/// The COA acts as a bridge between your Cadence wallet and Flow EVM,
/// allowing the DCA system to execute swaps on FlowSwap V3/PunchSwap V2 pools.
///
/// @param fundingAmount: Amount of FLOW to deposit into COA for gas fees (recommended: 1.0 FLOW)
///
transaction(fundingAmount: UFix64) {

    let authAccount: auth(Storage, Capabilities) &Account

    prepare(signer: auth(Storage, Capabilities, BorrowValue) &Account) {
        self.authAccount = signer

        // Check if COA already exists
        if signer.storage.type(at: /storage/evm) != nil {
            // COA already exists, check if it's properly set up
            let existingCOA = signer.storage.borrow<&EVM.CadenceOwnedAccount>(from: /storage/evm)
            if existingCOA != nil {
                log("COA already exists at /storage/evm")
                return
            }
        }

        // Create a new COA
        let coa <- EVM.createCadenceOwnedAccount()

        // Fund the COA if funding amount is provided (for gas fees)
        if fundingAmount > 0.0 {
            let flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
                from: /storage/flowTokenVault
            ) ?? panic("Could not borrow FlowToken vault")

            let fundingVault <- flowVault.withdraw(amount: fundingAmount)
            coa.deposit(from: <- (fundingVault as! @FlowToken.Vault))
        }

        // Save the COA to storage
        signer.storage.save(<-coa, to: /storage/evm)

        // Create public capability for the COA address
        let coaAddressCap = signer.capabilities.storage.issue<&EVM.CadenceOwnedAccount>(
            /storage/evm
        )
        signer.capabilities.publish(coaAddressCap, at: /public/evm)

        log("COA created successfully")
    }

    execute {
        // Verify the COA was created
        let coa = self.authAccount.storage.borrow<&EVM.CadenceOwnedAccount>(from: /storage/evm)
            ?? panic("COA was not created properly")

        log("COA EVM Address: ".concat(coa.address().toString()))
    }
}
