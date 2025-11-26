/**
 * Cadence Transaction Templates
 *
 * All Cadence transaction and script code for the DCA application.
 * Uses template literals with 0x prefixes that FCL will replace with actual addresses.
 */

/**
 * Setup DCA Controller
 * Must be run once before creating any plans
 */
export const SETUP_CONTROLLER_TX = `
import "DCAController"
import "FlowToken"
import "FungibleToken"

transaction {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Check if controller already exists
        if signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) != nil {
            log("DCA Controller already exists")
            return
        }

        // Create controller
        let controller <- DCAController.createController()

        // Store controller
        signer.storage.save(<-controller, to: DCAController.ControllerStoragePath)

        // Create public capability
        let cap = signer.capabilities.storage.issue<&DCAController.Controller>(
            DCAController.ControllerStoragePath
        )
        signer.capabilities.publish(cap, at: DCAController.ControllerPublicPath)

        // Get Flow vault capability
        let flowVaultCap = signer.capabilities
            .get<&FlowToken.Vault>(/public/flowTokenReceiver)

        // Borrow controller and set vault capability
        let controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        )!

        controllerRef.setSourceVaultCapability(cap: flowVaultCap)
        controllerRef.setTargetVaultCapability(cap: flowVaultCap)

        log("DCA Controller setup complete")
    }
}
`;

/**
 * Create DCA Plan
 *
 * @param amountPerInterval - Amount of FLOW per interval (UFix64)
 * @param intervalDays - Days between executions (UInt64)
 * @param maxSlippageBps - Max slippage in basis points (UInt64, e.g. 100 = 1%)
 * @param maxExecutions - Optional max executions (UInt64? or nil)
 * @param firstExecutionDelay - Seconds until first execution (UInt64)
 */
export const CREATE_PLAN_TX = `
import "DCAPlan"
import "DCAController"
import "DeFiMath"
import "FlowToken"

transaction(
    amountPerInterval: UFix64,
    intervalDays: UInt64,
    maxSlippageBps: UInt64,
    maxExecutions: UInt64?,
    firstExecutionDelay: UInt64
) {
    let controllerRef: &DCAController.Controller

    prepare(signer: auth(Storage) &Account) {
        // Borrow controller
        self.controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) ?? panic("DCA Controller not found. Run setup first")

        // Validate controller is fully configured
        assert(
            self.controllerRef.isFullyConfigured(),
            message: "Controller not fully configured"
        )
    }

    execute {
        // Validate inputs
        assert(amountPerInterval > 0.0, message: "Amount must be positive")
        assert(intervalDays > 0, message: "Interval must be positive")
        assert(DeFiMath.isValidSlippage(slippageBps: maxSlippageBps), message: "Invalid slippage")
        assert(firstExecutionDelay > 0, message: "Delay must be positive")

        // Convert interval to seconds
        let intervalSeconds = intervalDays * 86400

        // Calculate first execution time
        let firstExecutionTime = getCurrentBlock().timestamp + UFix64(firstExecutionDelay)

        // Create plan
        let plan <- DCAPlan.createPlan(
            sourceTokenType: Type<@FlowToken.Vault>(),
            targetTokenType: Type<@FlowToken.Vault>(),
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds,
            maxSlippageBps: maxSlippageBps,
            maxExecutions: maxExecutions,
            firstExecutionTime: firstExecutionTime
        )

        let planId = plan.id

        // Add to controller
        self.controllerRef.addPlan(plan: <-plan)

        log("Created DCA Plan #".concat(planId.toString()))
    }
}
`;

/**
 * Get all plans for an address
 *
 * @param address - Account address to query
 * @returns Array of plan details
 */
export const GET_ALL_PLANS_SCRIPT = `
import "DCAController"
import "DCAPlan"

access(all) fun main(address: Address): [DCAPlan.PlanDetails] {
    let account = getAccount(address)

    let controllerRef = account.capabilities
        .get<&DCAController.Controller>(DCAController.ControllerPublicPath)
        .borrow()

    if controllerRef == nil {
        return []
    }

    return controllerRef!.getAllPlans()
}
`;

/**
 * Check if controller is configured
 *
 * @param address - Account address to check
 * @returns True if controller exists and is configured
 */
export const CHECK_CONTROLLER_SCRIPT = `
import "DCAController"

access(all) fun main(address: Address): Bool {
    let account = getAccount(address)

    let controllerRef = account.capabilities
        .get<&DCAController.Controller>(DCAController.ControllerPublicPath)
        .borrow()

    if controllerRef == nil {
        return false
    }

    return controllerRef!.isFullyConfigured()
}
`;

/**
 * Get plan details by ID
 *
 * @param address - Account address
 * @param planId - Plan ID
 * @returns Plan details or nil
 */
export const GET_PLAN_DETAILS_SCRIPT = `
import "DCAController"
import "DCAPlan"

access(all) fun main(address: Address, planId: UInt64): DCAPlan.PlanDetails? {
    let account = getAccount(address)

    let controllerRef = account.capabilities
        .get<&DCAController.Controller>(DCAController.ControllerPublicPath)
        .borrow()

    if controllerRef == nil {
        return nil
    }

    return controllerRef!.getPlan(planId: planId)
}
`;
