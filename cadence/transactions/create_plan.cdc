import "DCAPlan"
import "DCAController"
import "DeFiMath"
import "FlowToken"
import TeleportedTetherToken from 0xcfdd90d4a00f7b5b

/// Create DCA Plan for USDT → FLOW
///
/// This transaction creates a new DCA plan that swaps USDT to FLOW at regular intervals.
///
/// Parameters:
/// - amountPerInterval: Amount of USDT to invest each interval (e.g., 10.0)
/// - intervalDays: Days between executions (e.g., 7 for weekly)
/// - maxSlippageBps: Max acceptable slippage in basis points (e.g., 100 = 1%)
/// - maxExecutions: Optional max number of executions (nil = unlimited)
/// - firstExecutionDelay: Seconds until first execution (e.g., 60 for 1 minute)
///
/// Example:
/// - amountPerInterval: 10.0 USDT
/// - intervalDays: 7 (weekly)
/// - maxSlippageBps: 100 (1% slippage)
/// - maxExecutions: nil (unlimited)
/// - firstExecutionDelay: 300 (5 minutes from now)
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
        ) ?? panic("DCA Controller not found. Run setup_controller.cdc first")

        // Validate controller is fully configured
        assert(
            self.controllerRef.isFullyConfigured(),
            message: "Controller not fully configured. Ensure vault capabilities are set."
        )
    }

    execute {
        // Validate inputs
        assert(amountPerInterval > 0.0, message: "Amount per interval must be positive")
        assert(intervalDays > 0, message: "Interval days must be positive")
        assert(DeFiMath.isValidSlippage(slippageBps: maxSlippageBps), message: "Invalid slippage value")
        assert(firstExecutionDelay > 0, message: "First execution delay must be positive")

        // Convert interval days to seconds
        let intervalSeconds = intervalDays * 86400 // 24 * 60 * 60

        // Calculate first execution time
        let firstExecutionTime = getCurrentBlock().timestamp + UFix64(firstExecutionDelay)

        // Create plan for USDT → FLOW swap
        let plan <- DCAPlan.createPlan(
            sourceTokenType: Type<@TeleportedTetherToken.Vault>(),
            targetTokenType: Type<@FlowToken.Vault>(),
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds,
            maxSlippageBps: maxSlippageBps,
            maxExecutions: maxExecutions,
            firstExecutionTime: firstExecutionTime
        )

        let planId = plan.id
        log("Created USDT → FLOW DCA Plan with ID: ".concat(planId.toString()))
        log("First execution scheduled for: ".concat(firstExecutionTime.toString()))
        log("Interval: ".concat(intervalDays.toString()).concat(" days (").concat(intervalSeconds.toString()).concat(" seconds)"))
        log("Amount per interval: ".concat(amountPerInterval.toString()).concat(" USDT"))
        log("Max slippage: ".concat(maxSlippageBps.toString()).concat(" bps (").concat((UFix64(maxSlippageBps) / 100.0).toString()).concat("%)"))

        if maxExecutions != nil {
            log("Max executions: ".concat(maxExecutions!.toString()))
        } else {
            log("Max executions: unlimited")
        }

        // Add to controller
        self.controllerRef.addPlan(plan: <-plan)

        log("Plan added to controller successfully")

        // Verify plan was added
        let planCount = self.controllerRef.getPlanIds().length
        assert(planCount > 0, message: "Plan was not added to controller")
    }
}
