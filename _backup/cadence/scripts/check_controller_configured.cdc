import "DCAController"

/// Check if Controller is Configured
///
/// This script checks if a user has a DCA Controller set up and
/// if it is fully configured with vault capabilities.
///
/// Parameters:
/// - address: The account address to check
///
/// Returns:
/// - Struct with existence and configuration status
access(all) struct ControllerStatus {
    access(all) let exists: Bool
    access(all) let configured: Bool
    access(all) let planCount: Int

    init(exists: Bool, configured: Bool, planCount: Int) {
        self.exists = exists
        self.configured = configured
        self.planCount = planCount
    }
}

access(all) fun main(address: Address): ControllerStatus {
    let account = getAccount(address)

    let controllerRef = account.capabilities
        .get<&DCAController.Controller>(DCAController.ControllerPublicPath)
        .borrow()

    if controllerRef == nil {
        return ControllerStatus(exists: false, configured: false, planCount: 0)
    }

    let configured = controllerRef!.isFullyConfigured()
    let planCount = controllerRef!.getPlanIds().length

    return ControllerStatus(exists: true, configured: configured, planCount: planCount)
}
