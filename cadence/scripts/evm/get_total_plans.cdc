import DCAServiceEVM from "DCAServiceEVM"

/// Get the total number of DCA plans created
///
access(all) fun main(): Int {
    return DCAServiceEVM.getTotalPlans()
}
