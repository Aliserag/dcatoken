import "DCAControllerV3"
import "DCAPlanV3"

/// Get all DCA plans for an address (V3)
///
/// Returns array of plan details including execution stats, status, and accounting.
///
/// @param address: Flow address to query
/// @return Array of PlanDetails structs (empty if no controller found)
///
access(all) fun main(address: Address): [DCAPlanV3.PlanDetails] {
    // Get public capability
    let controllerCap = getAccount(address)
        .capabilities.get<&DCAControllerV3.Controller>(
            DCAControllerV3.ControllerPublicPath
        )

    // Borrow controller
    if let controller = controllerCap.borrow() {
        return controller.getAllPlans()
    }

    // No controller found
    return []
}
