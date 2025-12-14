import EVM from "EVM"
import DCAServiceEVM from "DCAServiceEVM"

/// Check a user's ERC-20 allowance for the shared COA
/// This tells us how much the COA is allowed to transfer from the user
///
access(all) fun main(userEVMAddressHex: String, tokenAddressHex: String): UInt256 {
    let userEVMAddress = EVM.addressFromString(userEVMAddressHex)
    let tokenAddress = EVM.addressFromString(tokenAddressHex)

    return DCAServiceEVM.checkAllowance(
        userEVMAddress: userEVMAddress,
        tokenAddress: tokenAddress
    )
}
