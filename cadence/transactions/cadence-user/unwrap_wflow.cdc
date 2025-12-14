import EVM from "EVM"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"

/// Unwrap WFLOW to FLOW for Cadence users
/// This withdraws WFLOW back to native FLOW and transfers it to the user's Flow vault
///
/// Parameters:
/// - amount: Amount of WFLOW to unwrap (in wei, UInt256)
///           For 1 WFLOW: 1000000000000000000
///
transaction(amount: UInt256) {
    let coa: auth(EVM.Call, EVM.Withdraw) &EVM.CadenceOwnedAccount
    let flowVault: &{FungibleToken.Receiver}

    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Borrow the COA with withdraw entitlement
        self.coa = signer.storage.borrow<auth(EVM.Call, EVM.Withdraw) &EVM.CadenceOwnedAccount>(from: /storage/evm)
            ?? panic("No COA found. Run setup_coa.cdc first.")

        // Borrow FLOW vault receiver
        self.flowVault = signer.storage.borrow<&{FungibleToken.Receiver}>(from: /storage/flowTokenVault)
            ?? panic("No FLOW vault found")
    }

    execute {
        // WFLOW address on Flow EVM mainnet
        let wflowAddress = EVM.addressFromString("0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e")

        // Call withdraw(uint256) on WFLOW contract (unwraps WFLOW to native FLOW)
        let calldata = EVM.encodeABIWithSignature("withdraw(uint256)", [amount])

        let result = self.coa.call(
            to: wflowAddress,
            data: calldata,
            gasLimit: 100_000,
            value: EVM.Balance(attoflow: 0)
        )

        assert(result.status == EVM.Status.successful, message: "WFLOW unwrap failed")

        // Now withdraw the native FLOW from COA to Cadence
        // Convert wei to UFix64 (divide by 10^10 since FLOW has 8 decimals, EVM has 18)
        let amountFlow = UFix64(amount / 10_000_000_000) / 100_000_000.0

        // Withdraw from COA as FLOW
        let withdrawnFlow <- self.coa.withdraw(balance: EVM.Balance(attoflow: UInt(amount)))
        self.flowVault.deposit(from: <-withdrawnFlow)

        log("Successfully unwrapped WFLOW to FLOW")
        log("  Amount: ".concat(amountFlow.toString()).concat(" FLOW"))
    }
}
