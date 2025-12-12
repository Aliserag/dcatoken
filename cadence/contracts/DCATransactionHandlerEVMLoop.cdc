import "FlowTransactionScheduler"
import "FlowTransactionSchedulerUtils"
import "DCAControllerUnified"
import "DCAPlanUnified"
import "FungibleToken"
import "FlowToken"
import "EVM"
import "DeFiActions"
import "UniswapV3SwapperConnector"

/// DCATransactionHandlerEVMLoop: Self-rescheduling EVM DCA handler
///
/// Combines:
/// - Proven EVM swap logic from EVMMinimal
/// - Auto-rescheduling pattern from V2Loop (official scaffold)
/// - High executionEffort (9999) for EVM operations
///
/// Storage: /storage/DCATransactionHandlerEVMLoop
access(all) contract DCATransactionHandlerEVMLoop {

    /// Loop configuration - matches official scaffold pattern
    access(all) struct LoopConfig {
        access(all) let planId: UInt64
        access(all) let intervalSeconds: UFix64
        access(all) let schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>
        access(all) let feeProviderCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>
        access(all) let priority: FlowTransactionScheduler.Priority
        access(all) let executionEffort: UInt64

        init(
            planId: UInt64,
            intervalSeconds: UFix64,
            schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>,
            feeProviderCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>,
            priority: FlowTransactionScheduler.Priority,
            executionEffort: UInt64
        ) {
            self.planId = planId
            self.intervalSeconds = intervalSeconds
            self.schedulerManagerCap = schedulerManagerCap
            self.feeProviderCap = feeProviderCap
            self.priority = priority
            self.executionEffort = executionEffort
        }
    }

    /// Events
    access(all) event SwapExecuted(
        transactionId: UInt64,
        planId: UInt64,
        amountIn: UFix64,
        amountOut: UFix64,
        swapType: String,
        nextScheduled: Bool
    )

    access(all) event SwapFailed(
        transactionId: UInt64,
        planId: UInt64,
        reason: String
    )

    access(all) event Rescheduled(
        planId: UInt64,
        nextExecutionTime: UFix64,
        newScheduleId: UInt64
    )

    /// Handler resource
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {
        access(self) let controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>

        init(controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>) {
            pre { controllerCap.check(): "Invalid controller capability" }
            self.controllerCap = controllerCap
        }

        access(FlowTransactionScheduler.Execute) fun executeTransaction(id: UInt64, data: AnyStruct?) {
            // 1. Parse LoopConfig
            let config = data as? LoopConfig
            if config == nil {
                emit SwapFailed(transactionId: id, planId: 0, reason: "Invalid LoopConfig")
                return
            }
            let planId = config!.planId

            // 2. Borrow controller
            let controller = self.controllerCap.borrow()
            if controller == nil {
                emit SwapFailed(transactionId: id, planId: planId, reason: "No controller")
                return
            }

            // 3. Borrow plan
            let plan = controller!.borrowPlan(id: planId)
            if plan == nil {
                emit SwapFailed(transactionId: id, planId: planId, reason: "No plan")
                return
            }

            // 4. Check plan status
            if plan!.status != DCAPlanUnified.PlanStatus.Active {
                emit SwapFailed(transactionId: id, planId: planId, reason: "Plan not active")
                return
            }

            if plan!.hasReachedMaxExecutions() {
                emit SwapFailed(transactionId: id, planId: planId, reason: "Max executions reached")
                return
            }

            // 5. Execute EVM swap
            let swapResult = self.executeEVMSwap(controller: controller!, plan: plan!, transactionId: id)

            if !swapResult.success {
                emit SwapFailed(transactionId: id, planId: planId, reason: swapResult.error ?? "swap failed")
                return
            }

            // 6. Record execution on plan
            plan!.recordExecution(amountIn: swapResult.amountIn!, amountOut: swapResult.amountOut!)
            plan!.scheduleNextExecution()

            // 7. Reschedule if plan still active
            var nextScheduled = false
            if plan!.status == DCAPlanUnified.PlanStatus.Active && !plan!.hasReachedMaxExecutions() {
                nextScheduled = self.reschedule(config: config!, data: data!)
            }

            emit SwapExecuted(
                transactionId: id,
                planId: planId,
                amountIn: swapResult.amountIn!,
                amountOut: swapResult.amountOut!,
                swapType: "EVM/UniswapV3",
                nextScheduled: nextScheduled
            )
        }

        /// Execute EVM swap via UniswapV3
        access(self) fun executeEVMSwap(
            controller: auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller,
            plan: &DCAPlanUnified.Plan,
            transactionId: UInt64
        ): SwapResult {
            // Validate EVM requirements
            if !plan.requiresEVM() {
                return SwapResult(success: false, amountIn: nil, amountOut: nil, error: "Not an EVM plan")
            }

            // Get COA
            let coaCap = controller.getCOACapability()
            if coaCap == nil || !coaCap!.check() {
                return SwapResult(success: false, amountIn: nil, amountOut: nil, error: "No COA")
            }

            // Get source vault
            let sourceVaultCap = controller.getSourceVaultCapability()
            if sourceVaultCap == nil || !sourceVaultCap!.check() {
                return SwapResult(success: false, amountIn: nil, amountOut: nil, error: "No source vault")
            }
            let sourceVault = sourceVaultCap!.borrow()!

            // Get target vault
            let targetVaultCap = controller.getTargetVaultCapability()
            if targetVaultCap == nil || !targetVaultCap!.check() {
                return SwapResult(success: false, amountIn: nil, amountOut: nil, error: "No target vault")
            }

            let amountIn = plan.amountPerInterval
            if sourceVault.balance < amountIn {
                return SwapResult(success: false, amountIn: nil, amountOut: nil, error: "Insufficient balance")
            }

            // Withdraw FLOW for swap
            let tokensToSwap <- sourceVault.withdraw(amount: amountIn) as! @FlowToken.Vault

            // Setup EVM addresses for USDF
            let usdfEVMAddress = EVM.addressFromString("0x2aabea2058b5ac2d339b163c6ab6f2b6d53aabed")
            let wflowEVMAddress = EVM.addressFromString("0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e")
            let tokenPath: [EVM.EVMAddress] = [wflowEVMAddress, usdfEVMAddress]

            // Create swapper
            let swapper <- UniswapV3SwapperConnector.createSwapperWithDefaults(
                tokenPath: tokenPath,
                feePath: [3000],  // 0.3% fee tier
                inVaultType: plan.sourceTokenType,
                outVaultType: plan.targetTokenType,
                coaCapability: coaCap!
            )

            // Get quote
            let quote = swapper.getQuote(
                fromTokenType: plan.sourceTokenType,
                toTokenType: plan.targetTokenType,
                amount: amountIn
            )

            // Apply slippage
            let minAmount = quote.expectedAmount * (10000.0 - UFix64(plan.maxSlippageBps)) / 10000.0
            let adjustedQuote = DeFiActions.Quote(
                expectedAmount: quote.expectedAmount,
                minAmount: minAmount,
                slippageTolerance: UFix64(plan.maxSlippageBps) / 10000.0,
                deadline: nil,
                data: quote.data
            )

            // Execute swap
            let swapped <- swapper.swap(inVault: <-tokensToSwap, quote: adjustedQuote)
            let amountOut = swapped.balance

            // Deposit to target
            let targetVault = targetVaultCap!.borrow()!
            targetVault.deposit(from: <-swapped)

            // Cleanup
            destroy swapper

            return SwapResult(success: true, amountIn: amountIn, amountOut: amountOut, error: nil)
        }

        /// Reschedule - follows official scaffold pattern
        access(self) fun reschedule(config: LoopConfig, data: AnyStruct): Bool {
            let future = getCurrentBlock().timestamp + config.intervalSeconds

            let estimate = FlowTransactionScheduler.estimate(
                data: data,
                timestamp: future,
                priority: config.priority,
                executionEffort: config.executionEffort
            )

            if estimate.timestamp == nil && config.priority != FlowTransactionScheduler.Priority.Low {
                return false
            }

            // Get fees from feeProviderCap (official pattern)
            let feeVault = config.feeProviderCap.borrow()
            if feeVault == nil {
                return false
            }

            // Use 2x fee for EVM operations to ensure enough gas
            let feeAmount = (estimate.flowFee ?? 0.0) * 2.0
            if feeVault!.balance < feeAmount {
                return false
            }

            let fees <- feeVault!.withdraw(amount: feeAmount)

            let manager = config.schedulerManagerCap.borrow()
            if manager == nil {
                // Return the fees if manager not available
                feeVault!.deposit(from: <-fees)
                return false
            }

            let scheduleId = manager!.scheduleByHandler(
                handlerTypeIdentifier: self.getType().identifier,
                handlerUUID: self.uuid,
                data: data,
                timestamp: future,
                priority: config.priority,
                executionEffort: config.executionEffort,
                fees: <-fees as! @FlowToken.Vault
            )

            emit Rescheduled(planId: config.planId, nextExecutionTime: future, newScheduleId: scheduleId)
            return true
        }

        access(all) view fun getViews(): [Type] {
            return [Type<StoragePath>()]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<StoragePath>():
                    return /storage/DCATransactionHandlerEVMLoop
                default:
                    return nil
            }
        }
    }

    /// Swap result struct
    access(all) struct SwapResult {
        access(all) let success: Bool
        access(all) let amountIn: UFix64?
        access(all) let amountOut: UFix64?
        access(all) let error: String?

        init(success: Bool, amountIn: UFix64?, amountOut: UFix64?, error: String?) {
            self.success = success
            self.amountIn = amountIn
            self.amountOut = amountOut
            self.error = error
        }
    }

    /// Create handler
    access(all) fun createHandler(
        controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>
    ): @Handler {
        return <- create Handler(controllerCap: controllerCap)
    }

    /// Create loop config
    access(all) fun createLoopConfig(
        planId: UInt64,
        intervalSeconds: UFix64,
        schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>,
        feeProviderCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>,
        priority: FlowTransactionScheduler.Priority,
        executionEffort: UInt64
    ): LoopConfig {
        return LoopConfig(
            planId: planId,
            intervalSeconds: intervalSeconds,
            schedulerManagerCap: schedulerManagerCap,
            feeProviderCap: feeProviderCap,
            priority: priority,
            executionEffort: executionEffort
        )
    }
}
