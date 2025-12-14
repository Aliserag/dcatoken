import EVM from "EVM"

/// Get the EVM address of a Cadence user's COA
///
/// Parameters:
/// - address: The Cadence address of the user
///
/// Returns: The EVM address as a string, or nil if no COA exists
///
access(all) fun main(address: Address): String? {
    let account = getAccount(address)

    // Try to borrow the COA capability
    let coaCap = account.capabilities.get<&EVM.CadenceOwnedAccount>(/public/evm)

    if !coaCap.check() {
        return nil
    }

    let coa = coaCap.borrow()
    if coa == nil {
        return nil
    }

    return coa!.address().toString()
}
