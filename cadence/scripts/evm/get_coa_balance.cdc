import DCAServiceEVM from "DCAServiceEVM"

/// Get the shared COA's FLOW balance (for EVM gas)
///
access(all) fun main(): UFix64 {
    return DCAServiceEVM.getCOABalance()
}
