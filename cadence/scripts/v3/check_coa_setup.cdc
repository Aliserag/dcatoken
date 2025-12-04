import "EVM"

/// Check if COA is set up for EVM interactions
///
/// Returns COA details if configured, nil if not.
///
/// @param address: Flow address to check
/// @return Struct with COA info or nil
///
access(all) struct COAInfo {
    access(all) let evmAddress: String
    access(all) let balance: UFix64

    init(evmAddress: String, balance: UFix64) {
        self.evmAddress = evmAddress
        self.balance = balance
    }
}

access(all) fun main(address: Address): COAInfo? {
    // Get public capability
    let coaCap = getAccount(address)
        .capabilities.get<&EVM.CadenceOwnedAccount>(
            /public/evm
        )

    // Borrow COA
    if let coa = coaCap.borrow() {
        return COAInfo(
            evmAddress: coa.address().toString(),
            balance: coa.balance().inFLOW()
        )
    }

    // No COA found
    return nil
}
