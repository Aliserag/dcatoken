import "DCAPlan"
import "DCAController"
import "DeFiMath"
import "IncrementRoutes"
import "FungibleToken"

/// ScheduledHandler: Scheduled transaction handler for DCA execution
///
/// This contract implements the handler that gets called by Flow's
/// Scheduled Transaction system to execute DCA plans automatically.
///
/// Flow:
/// 1. User creates plan and schedules first execution
/// 2. At execution time, FlowTransactionScheduler calls this handler
/// 3. Handler:
///    - Validates plan is ready
///    - Builds Flow Actions stack (Source → Swapper → Sink)
///    - Executes swap via IncrementFi
///    - Updates plan accounting
///    - Reschedules next execution
///
/// Educational Notes:
/// - This handler runs autonomously without user signature
/// - Must have capability access to user's vaults (via DCAController)
/// - Uses atomic Flow Actions composition for swap execution
/// - Integrates with Forte Scheduled Transactions system
///
/// Scheduled Transaction Parameters:
/// - delaySeconds: Time until next execution
/// - priority: Execution priority (0-255)
/// - executionEffort: Gas/computation limit
access(all) contract ScheduledHandler {

    /// Event emitted when handler starts execution
    access(all) event HandlerExecutionStarted(
        planId: UInt64,
        owner: Address,
        timestamp: UFix64
    )

    /// Event emitted when handler completes successfully
    access(all) event HandlerExecutionCompleted(
        planId: UInt64,
        owner: Address,
        amountIn: UFix64,
        amountOut: UFix64,
        nextExecutionTime: UFix64?,
        timestamp: UFix64
    )

    /// Event emitted when handler execution fails
    access(all) event HandlerExecutionFailed(
        planId: UInt64,
        owner: Address,
        reason: String,
        timestamp: UFix64
    )

    /// Event emitted when next execution is scheduled
    access(all) event NextExecutionScheduled(
        planId: UInt64,
        owner: Address,
        scheduledTime: UFix64
    )

    /// Main execution handler called by scheduled transaction system
    ///
    /// This function is designed to be called automatically by the
    /// FlowTransactionScheduler at the scheduled execution time.
    ///
    /// @param ownerAddress: Address of the plan owner
    /// @param planId: ID of the plan to execute
    ///
    /// Note: In production, this would be registered with FlowTransactionScheduler
    /// and called autonomously. For emulator testing, we'll call it directly.
    access(all) fun executeDCA(ownerAddress: Address, planId: UInt64) {
        let timestamp = getCurrentBlock().timestamp

        emit HandlerExecutionStarted(
            planId: planId,
            owner: ownerAddress,
            timestamp: timestamp
        )

        // Borrow the user's DCA controller
        let controllerRef = getAccount(ownerAddress)
            .capabilities.get<&DCAController.Controller>(DCAController.ControllerPublicPath)
            .borrow()
            ?? panic("Could not borrow DCA controller from owner")

        // Borrow the plan
        let planRef = controllerRef.borrowPlan(id: planId)
            ?? panic("Could not borrow plan with ID: ".concat(planId.toString()))

        // Validate plan is ready for execution
        if !planRef.isReadyForExecution() {
            let reason = "Plan not ready for execution"
            emit HandlerExecutionFailed(
                planId: planId,
                owner: ownerAddress,
                reason: reason,
                timestamp: timestamp
            )
            return
        }

        // Check if plan has reached max executions
        if planRef.hasReachedMaxExecutions() {
            let reason = "Plan has reached maximum executions"
            emit HandlerExecutionFailed(
                planId: planId,
                owner: ownerAddress,
                reason: reason,
                timestamp: timestamp
            )
            return
        }

        // Get vault capabilities from controller
        let sourceVaultCap = controllerRef.getSourceVaultCapability()
            ?? panic("Source vault capability not configured")

        let targetVaultCap = controllerRef.getTargetVaultCapability()
            ?? panic("Target vault capability not configured")

        // Validate capabilities
        if !sourceVaultCap.check() || !targetVaultCap.check() {
            let reason = "Invalid vault capabilities"
            emit HandlerExecutionFailed(
                planId: planId,
                owner: ownerAddress,
                reason: reason,
                timestamp: timestamp
            )
            return
        }

        // Execute the swap
        let result = self.executeSwap(
            planRef: planRef,
            sourceVaultCap: sourceVaultCap,
            targetVaultCap: targetVaultCap
        )

        if result.success {
            // Record successful execution
            planRef.recordExecution(
                amountIn: result.amountIn!,
                amountOut: result.amountOut!
            )

            // Schedule next execution if plan is still active
            var nextTime: UFix64? = nil
            if planRef.status == DCAPlan.PlanStatus.Active && !planRef.hasReachedMaxExecutions() {
                planRef.scheduleNextExecution()
                nextTime = planRef.nextExecutionTime

                // In production, here we would call FlowTransactionScheduler
                // to schedule the next execution. Example:
                // FlowTransactionScheduler.schedule(
                //     delaySeconds: planRef.intervalSeconds,
                //     handler: self.executeDCA,
                //     params: {"ownerAddress": ownerAddress, "planId": planId}
                // )

                if let scheduledTime = nextTime {
                    emit NextExecutionScheduled(
                        planId: planId,
                        owner: ownerAddress,
                        scheduledTime: scheduledTime
                    )
                }
            }

            emit HandlerExecutionCompleted(
                planId: planId,
                owner: ownerAddress,
                amountIn: result.amountIn!,
                amountOut: result.amountOut!,
                nextExecutionTime: nextTime,
                timestamp: timestamp
            )
        } else {
            emit HandlerExecutionFailed(
                planId: planId,
                owner: ownerAddress,
                reason: result.errorMessage ?? "Unknown error",
                timestamp: timestamp
            )
        }
    }

    /// Execute the token swap using Flow Actions + IncrementFi
    ///
    /// This is where the DeFi magic happens:
    /// 1. Withdraw source tokens (FLOW) from user's vault
    /// 2. Build Flow Actions stack: Source → Swapper → Sink
    /// 3. Execute swap via IncrementFi connector
    /// 4. Deposit target tokens (Beaver) to user's vault
    ///
    /// @param planRef: Reference to the DCA plan
    /// @param sourceVaultCap: Capability to withdraw from source vault
    /// @param targetVaultCap: Capability to deposit to target vault
    /// @return ExecutionResult with success status and amounts
    access(self) fun executeSwap(
        planRef: &DCAPlan.Plan,
        sourceVaultCap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>,
        targetVaultCap: Capability<&{FungibleToken.Receiver}>
    ): ExecutionResult {

        // Validate swap route exists
        let sourceTokenId = planRef.sourceTokenType.identifier
        let targetTokenId = planRef.targetTokenType.identifier

        if !IncrementRoutes.validateRoute(sourceToken: sourceTokenId, targetToken: targetTokenId) {
            return ExecutionResult(
                success: false,
                amountIn: nil,
                amountOut: nil,
                errorMessage: "No valid swap route found"
            )
        }

        // Get amount to invest this interval
        let amountIn = planRef.amountPerInterval

        // Borrow source vault and withdraw
        let sourceVault = sourceVaultCap.borrow()
            ?? panic("Could not borrow source vault")

        // Check sufficient balance
        if sourceVault.balance < amountIn {
            return ExecutionResult(
                success: false,
                amountIn: nil,
                amountOut: nil,
                errorMessage: "Insufficient balance in source vault"
            )
        }

        let tokensToSwap <- sourceVault.withdraw(amount: amountIn)

        // In production, this is where we would build the Flow Actions stack:
        //
        // let swapperConnector = IncrementSwapConnector.createSwapper(
        //     sourceToken: planRef.sourceTokenType,
        //     targetToken: planRef.targetTokenType
        // )
        //
        // let minOut = DeFiMath.calculateMinOutWithSlippage(
        //     amountIn: amountIn,
        //     expectedPriceFP128: planRef.avgExecutionPriceFP128,
        //     slippageBps: planRef.maxSlippageBps
        // )
        //
        // let swappedTokens <- swapperConnector.swap(
        //     tokens: <-tokensToSwap,
        //     minOut: minOut
        // )
        //
        // For this educational scaffold, we'll simulate a swap with a mock result
        // Until IncrementFi connectors are properly integrated

        let amountOut = self.simulateSwap(amountIn: amountIn)
        let swappedTokens <- tokensToSwap // In reality, this would be swapped tokens

        // Deposit to target vault
        let targetVault = targetVaultCap.borrow()
            ?? panic("Could not borrow target vault")

        targetVault.deposit(from: <-swappedTokens)

        return ExecutionResult(
            success: true,
            amountIn: amountIn,
            amountOut: amountOut,
            errorMessage: nil
        )
    }

    /// Simulate a swap for testing purposes
    ///
    /// This is a placeholder until IncrementFi connectors are integrated.
    /// Assumes 1 FLOW = 2.5 Beaver with some randomness.
    ///
    /// TODO: Replace with actual IncrementFi swap connector
    access(self) fun simulateSwap(amountIn: UFix64): UFix64 {
        // Simulate price: 1 FLOW = 2.5 Beaver
        // Add small variance: +/- 2%
        let basePrice = 2.5
        let variance = 0.02
        let randomFactor = 1.0 + (variance * (UFix64(getCurrentBlock().height % 100) / 100.0 - 0.5))
        return amountIn * basePrice * randomFactor
    }

    /// Result struct for swap execution
    access(all) struct ExecutionResult {
        access(all) let success: Bool
        access(all) let amountIn: UFix64?
        access(all) let amountOut: UFix64?
        access(all) let errorMessage: String?

        init(success: Bool, amountIn: UFix64?, amountOut: UFix64?, errorMessage: String?) {
            self.success = success
            self.amountIn = amountIn
            self.amountOut = amountOut
            self.errorMessage = errorMessage
        }
    }

    init() {
        // In production, this contract would register with FlowTransactionScheduler
        // FlowTransactionScheduler.registerHandler(
        //     name: "DCAExecutionHandler",
        //     handler: self.executeDCA
        // )
    }
}
