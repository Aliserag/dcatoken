import DCAServiceEVM from "DCAServiceEVM"

/// Get the shared COA address
/// This is the address users need to approve for ERC-20 transferFrom
///
access(all) fun main(): String {
    return DCAServiceEVM.getCOAAddress().toString()
}
