import EVM from "EVM"
import DCAServiceEVM from "DCAServiceEVM"

/// Get all DCA plans for a specific EVM user address
///
access(all) fun main(userEVMAddressHex: String): [DCAServiceEVM.PlanData] {
    let userEVMAddress = EVM.addressFromString(userEVMAddressHex)
    return DCAServiceEVM.getUserPlans(userEVMAddress: userEVMAddress)
}
