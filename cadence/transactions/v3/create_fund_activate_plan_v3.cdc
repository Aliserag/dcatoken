import "DCAPlanV3"
import "DCAControllerV3"
import "DCATransactionHandlerV3"
import "DeFiMath"
import "FlowToken"
import "FungibleToken"
import EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed from 0x1e4aa0b87d10b141
import "FlowTransactionScheduler"
import "FlowTransactionSchedulerUtils"

/// Create, Fund, and Activate DCA Plan V3 (All-in-One)
///
/// This transaction creates a new DCA plan and immediately schedules it for autonomous execution.
/// It handles FLOW → USDF swaps on EVM DEXes (FlowSwap V3 / PunchSwap V2).
///
/// Prerequisites:
/// - COA must be created (run setup_coa.cdc)
/// - Controller must be set up (run setup_controller_v3.cdc)
/// - Handler must be initialized (run init_dca_handler_v3.cdc)
///
/// @param amountPerInterval: Amount of FLOW to invest per interval
/// @param intervalSeconds: Time between executions (in seconds)
/// @param maxSlippageBps: Maximum acceptable slippage in basis points (100 = 1%)
/// @param maxExecutions: Optional maximum number of executions (nil = unlimited)
/// @param firstExecutionDelay: Delay before first execution (in seconds)
/// @param numExecutionsToFund: Number of executions to pre-fund
/// @param priority: Execution priority (0=High, 1=Medium, 2=Low)
/// @param executionEffort: Gas limit for execution (recommended: 1000)
///
transaction(
    amountPerInterval: UFix64,
    intervalSeconds: UInt64,
    maxSlippageBps: UInt64,
    maxExecutions: UInt64?,
    firstExecutionDelay: UInt64,
    numExecutionsToFund: UInt64,
    priority: UInt8,
    executionEffort: UInt64
) {
    let controllerRef: &DCAControllerV3.Controller
    let planId: UInt64
    let flowVault: auth(FungibleToken.Withdraw) &FlowToken.Vault
    let handlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>
    let manager: auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}
    let priorityEnum: FlowTransactionScheduler.Priority
    let delaySeconds: UFix64
    let signerAccount: auth(Storage, Capabilities, IssueStorageCapabilityController) &Account

    prepare(signer: auth(Storage, Capabilities, BorrowValue, IssueStorageCapabilityController, SaveValue, GetStorageCapabilityController, PublishCapability) &Account) {
        // Store signer account reference for execute phase
        self.signerAccount = signer

        // === STEP 1: Validate inputs ===
        assert(amountPerInterval > 0.0, message: "Amount must be positive")
        assert(intervalSeconds > 0, message: "Interval must be positive")
        assert(DeFiMath.isValidSlippage(slippageBps: maxSlippageBps), message: "Invalid slippage")
        assert(firstExecutionDelay > 0, message: "Delay must be positive")

        // === STEP 2: Create the DCA Plan ===

        // Borrow controller V3
        self.controllerRef = signer.storage.borrow<&DCAControllerV3.Controller>(
            from: DCAControllerV3.ControllerStoragePath
        ) ?? panic("DCA Controller V3 not found. Run setup_controller_v3.cdc first")

        // Validate controller is fully configured (including COA)
        assert(
            self.controllerRef.isFullyConfigured(),
            message: "Controller not fully configured. Ensure COA is set up."
        )

        // Calculate first execution time
        let firstExecutionTime = getCurrentBlock().timestamp + UFix64(firstExecutionDelay)

        // Create plan for FLOW → USDF swap on EVM
        let plan <- DCAPlanV3.createPlan(
            sourceTokenType: Type<@FlowToken.Vault>(),
            targetTokenType: Type<@EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed.Vault>(),
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds,
            maxSlippageBps: maxSlippageBps,
            maxExecutions: maxExecutions,
            firstExecutionTime: firstExecutionTime
        )

        // Capture plan ID before moving resource
        self.planId = plan.id

        // Add to controller
        self.controllerRef.addPlan(plan: <-plan)

        log("Created FLOW → USDF DCA Plan V3 #".concat(self.planId.toString()))

        // === STEP 3: Prepare for funding and scheduling ===

        // Borrow FLOW vault
        self.flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FLOW vault")

        // Convert priority to enum
        self.priorityEnum = priority == 0
            ? FlowTransactionScheduler.Priority.High
            : priority == 1
                ? FlowTransactionScheduler.Priority.Medium
                : FlowTransactionScheduler.Priority.Low

        // Get the entitled capability for the V3 handler
        var handlerCapTemp: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>? = nil

        let controllers = signer.capabilities.storage.getControllers(forPath: /storage/DCATransactionHandlerV3)
        assert(controllers.length > 0, message: "No V3 handler found. Run init_dca_handler_v3.cdc first")

        // Find the correct capability (with Execute entitlement)
        for controller in controllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}> {
                handlerCapTemp = cap
                break
            }
        }

        assert(handlerCapTemp != nil, message: "Could not find Execute-entitled handler capability")
        self.handlerCap = handlerCapTemp!

        // Create or borrow manager
        if signer.storage.borrow<&AnyResource>(from: FlowTransactionSchedulerUtils.managerStoragePath) == nil {
            let managerResource <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-managerResource, to: FlowTransactionSchedulerUtils.managerStoragePath)

            // Create public capability for the manager
            let managerCapPublic = signer.capabilities.storage.issue<&{FlowTransactionSchedulerUtils.Manager}>(
                FlowTransactionSchedulerUtils.managerStoragePath
            )
            signer.capabilities.publish(managerCapPublic, at: FlowTransactionSchedulerUtils.managerPublicPath)
        }

        // Borrow the manager with Owner entitlement
        self.manager = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("Could not borrow manager")

        self.delaySeconds = UFix64(firstExecutionDelay)
    }

    execute {
        // === STEP 4: Fund fee vault ===

        let future = getCurrentBlock().timestamp + self.delaySeconds

        // Create Manager capability for fee estimation and autonomous rescheduling
        let managerCap = self.signerAccount.capabilities.storage.issue<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            FlowTransactionSchedulerUtils.managerStoragePath
        )

        // Create schedule config for estimation
        let scheduleConfig = DCATransactionHandlerV3.ScheduleConfig(
            schedulerManagerCap: managerCap,
            priority: self.priorityEnum,
            executionEffort: executionEffort
        )

        // Prepare transaction data for estimation
        let transactionData = DCATransactionHandlerV3.DCATransactionData(
            planId: self.planId,
            scheduleConfig: scheduleConfig
        )

        // Estimate fee for ONE execution
        let estimate = FlowTransactionScheduler.estimate(
            data: transactionData,
            timestamp: future,
            priority: self.priorityEnum,
            executionEffort: executionEffort
        )

        // Get single execution fee and calculate total with 10% buffer
        let singleFee = estimate.flowFee ?? 0.0
        let totalFeeNeeded = singleFee * UFix64(numExecutionsToFund) * 1.1

        // Check if user has enough FLOW
        assert(
            self.flowVault.balance >= totalFeeNeeded,
            message: "Insufficient FLOW balance. Need ".concat(totalFeeNeeded.toString()).concat(" FLOW for ").concat(numExecutionsToFund.toString()).concat(" executions")
        )

        // Withdraw FLOW and deposit into fee vault
        let feeDeposit <- self.flowVault.withdraw(amount: totalFeeNeeded)
        let feeVaultCap = self.controllerRef.getFeeVaultCapability()
            ?? panic("Fee vault capability not configured")
        let feeVault = feeVaultCap.borrow()
            ?? panic("Could not borrow fee vault")
        feeVault.deposit(from: <-feeDeposit)

        log("Deposited ".concat(totalFeeNeeded.toString()).concat(" FLOW into fee vault for ").concat(numExecutionsToFund.toString()).concat(" executions"))

        // === STEP 5: Schedule the plan ===

        // Verify estimation succeeded
        assert(
            estimate.timestamp != nil || self.priorityEnum == FlowTransactionScheduler.Priority.Low,
            message: estimate.error ?? "Estimation failed"
        )

        // Withdraw scheduler fees from main vault
        let schedulerFeeAmount = estimate.flowFee ?? 0.0
        assert(self.flowVault.balance >= schedulerFeeAmount, message: "Insufficient FLOW balance for scheduler fees")

        let schedulerFees <- self.flowVault.withdraw(amount: schedulerFeeAmount) as! @FlowToken.Vault

        // Schedule through the manager
        let transactionId = self.manager.schedule(
            handlerCap: self.handlerCap,
            data: transactionData,
            timestamp: future,
            priority: self.priorityEnum,
            executionEffort: executionEffort,
            fees: <-schedulerFees
        )

        log("Scheduled Plan #".concat(self.planId.toString()).concat(" with transaction ID: ").concat(transactionId.toString()))
        log("Plan will autonomously reschedule itself after each execution on EVM DEXes")
    }
}
