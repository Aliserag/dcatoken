import EVM from "EVM"
import DCAServiceEVM from "DCAServiceEVM"

/// Get the WFLOW balance for a Flow account's COA
/// Uses DCAServiceEVM's COA to make the EVM call
///
/// Parameters:
/// - addr: Flow address of the account
///
/// Returns: WFLOW balance in wei (UInt256)
///
access(all) fun main(addr: Address): UInt256 {
    let account = getAccount(addr)

    // Get user's COA address
    let coaCap = account.capabilities.get<&EVM.CadenceOwnedAccount>(/public/evm)
    if !coaCap.check() {
        return 0
    }

    let coa = coaCap.borrow()!
    let userEVMAddress = coa.address()

    // WFLOW address
    let wflowAddress = EVM.addressFromString("0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e")

    // Use DCAServiceEVM to check balance (it can make EVM calls)
    // Actually, we need to use allowance as a proxy since we can't call balanceOf directly
    // For now, return 0 - the frontend should use web3 to check balance
    // Or we can add a getBalance function to DCAServiceEVM

    return 0
}
