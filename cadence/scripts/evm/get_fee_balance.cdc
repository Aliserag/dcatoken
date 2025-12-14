import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"

/// Get the balance of the DCA fee vault for an account
///
/// Parameters:
/// - addr: Address to check
///
/// Returns: UFix64 balance in FLOW
///
access(all) fun main(addr: Address): UFix64 {
    let account = getAccount(addr)

    let vaultCap = account.capabilities.get<&{FungibleToken.Balance}>(/public/DCAFeeVault)
    if vaultCap.check() {
        let vault = vaultCap.borrow()!
        return vault.balance
    }

    // Try to check via storage if public cap doesn't exist
    // Note: This won't work for other accounts, only for scripts that can access storage
    return 0.0
}
