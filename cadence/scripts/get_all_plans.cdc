import "DCAController"
import "DCAPlan"

/// Get All Plans
///
/// This script retrieves all DCA plans for a given address.
///
/// Parameters:
/// - address: The account address to query
///
/// Returns:
/// - Array of PlanDetails structs with full plan information
access(all) fun main(address: Address): [DCAPlan.PlanDetails] {
    let account = getAccount(address)

    let controllerRef = account.capabilities
        .get<&DCAController.Controller>(DCAController.ControllerPublicPath)
        .borrow()

    if controllerRef == nil {
        log("No DCA Controller found for address: ".concat(address.toString()))
        return []
    }

    let plans = controllerRef!.getAllPlans()

    log("Found ".concat(plans.length.toString()).concat(" plans for address ").concat(address.toString()))

    return plans
}
