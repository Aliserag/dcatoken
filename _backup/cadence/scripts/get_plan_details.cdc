import "DCAController"
import "DCAPlan"

/// Get Plan Details
///
/// This script retrieves detailed information about a specific DCA plan.
///
/// Parameters:
/// - address: The account address that owns the plan
/// - planId: The ID of the plan to query
///
/// Returns:
/// - PlanDetails struct with full plan information, or nil if not found
access(all) fun main(address: Address, planId: UInt64): DCAPlan.PlanDetails? {
    let account = getAccount(address)

    let controllerRef = account.capabilities
        .get<&DCAController.Controller>(DCAController.ControllerPublicPath)
        .borrow()

    if controllerRef == nil {
        log("No DCA Controller found for address: ".concat(address.toString()))
        return nil
    }

    let planRef = controllerRef!.getPlan(id: planId)

    if planRef == nil {
        log("No plan found with ID: ".concat(planId.toString()))
        return nil
    }

    return planRef!.getDetails()
}
