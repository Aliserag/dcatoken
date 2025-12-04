import "DCAControllerV3"

/// Check if DCA Controller V3 is fully configured
///
/// Returns true if controller exists and all capabilities are set (including COA).
///
/// @param address: Flow address to check
/// @return true if fully configured, false otherwise
///
access(all) fun main(address: Address): Bool {
    // Get public capability
    let controllerCap = getAccount(address)
        .capabilities.get<&DCAControllerV3.Controller>(
            DCAControllerV3.ControllerPublicPath
        )

    // Borrow controller
    if let controller = controllerCap.borrow() {
        return controller.isFullyConfigured()
    }

    // No controller found
    return false
}
