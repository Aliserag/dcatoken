import DCAServiceEVM from "DCAServiceEVM"

/// Get details of a specific DCA plan
///
access(all) fun main(planId: UInt64): DCAServiceEVM.PlanData? {
    return DCAServiceEVM.getPlan(planId: planId)
}
