import "DCAController"
import "DCAPlan"

/// Get Active Plans
///
/// This script retrieves only active DCA plans for a given address.
/// Active plans are those with status = Active and ready for execution.
///
/// Parameters:
/// - address: The account address to query
///
/// Returns:
/// - Array of PlanDetails structs for active plans only
access(all) fun main(address: Address): [DCAPlan.PlanDetails] {
    let account = getAccount(address)

    let controllerRef = account.capabilities
        .get<&DCAController.Controller>(DCAController.ControllerPublicPath)
        .borrow()

    if controllerRef == nil {
        log("No DCA Controller found for address: ".concat(address.toString()))
        return []
    }

    let activePlans = controllerRef!.getActivePlans()

    log("Found ".concat(activePlans.length.toString()).concat(" active plans for address ").concat(address.toString()))

    return activePlans
}
