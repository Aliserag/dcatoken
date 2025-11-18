import "DCAPlan"
import "DCAController"
import "DeFiMath"
import "FlowToken"

/// Create DCA Plan
///
/// This transaction creates a new DCA plan and adds it to the user's controller.
///
/// Parameters:
/// - amountPerInterval: Amount of FLOW to invest each interval (e.g., 10.0)
/// - intervalDays: Days between executions (e.g., 7 for weekly)
/// - maxSlippageBps: Max acceptable slippage in basis points (e.g., 100 = 1%)
/// - maxExecutions: Optional max number of executions (nil = unlimited)
/// - firstExecutionDelay: Seconds until first execution (e.g., 60 for 1 minute)
///
/// Example:
/// - amountPerInterval: 10.0 FLOW
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

        // Create plan
        let plan <- DCAPlan.createPlan(
            sourceTokenType: Type<@FlowToken.Vault>(),
            targetTokenType: Type<@FlowToken.Vault>(), // TODO: Replace with Beaver type when integrated
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds,
            maxSlippageBps: maxSlippageBps,
            maxExecutions: maxExecutions,
            firstExecutionTime: firstExecutionTime
        )

        let planId = plan.id
        log("Created DCA Plan with ID: ".concat(planId.toString()))
        log("First execution scheduled for: ".concat(firstExecutionTime.toString()))
        log("Interval: ".concat(intervalDays.toString()).concat(" days"))
        log("Amount per interval: ".concat(amountPerInterval.toString()).concat(" FLOW"))
        log("Max slippage: ".concat(maxSlippageBps.toString()).concat(" bps"))

        // Add to controller
        self.controllerRef.addPlan(plan: <-plan)

        log("Plan added to controller successfully")

        // Note: In production, we would also schedule the first execution
        // with FlowTransactionScheduler here:
        //
        // FlowTransactionScheduler.schedule(
        //     delaySeconds: firstExecutionDelay,
        //     priority: 128,
        //     executionEffort: 1000,
        //     handler: ScheduledHandler.executeDCA,
        //     params: {"ownerAddress": signer.address, "planId": planId}
        // )
    }

    post {
        self.controllerRef.getPlanIds().length > 0: "Plan was not added to controller"
    }
}
