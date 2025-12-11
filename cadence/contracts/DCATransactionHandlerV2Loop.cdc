import "FlowTransactionScheduler"
import "FlowTransactionSchedulerUtils"
import "DCAControllerV2"
import "DCAPlanV2"
import "FungibleToken"
import "FlowToken"
import "SwapRouter"
import EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14 from 0x1e4aa0b87d10b141

/// DCATransactionHandlerV2Loop: Self-rescheduling DCA handler
///
/// Follows the official CounterLoopTransactionHandler pattern:
/// - feeProviderCap passed directly in data (not fetched from controller)
/// - Minimal rescheduling logic
/// - 8 imports (reduced from 9)
access(all) contract DCATransactionHandlerV2Loop {

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

    access(all) event Executed(
        transactionId: UInt64,
        planId: UInt64,
        amountIn: UFix64,
        amountOut: UFix64,
        nextScheduled: Bool
    )

    access(all) event Failed(
        transactionId: UInt64,
        planId: UInt64,
        reason: String
    )

    /// Handler resource
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {
        access(self) let controllerCap: Capability<auth(DCAControllerV2.Owner) &DCAControllerV2.Controller>

        init(controllerCap: Capability<auth(DCAControllerV2.Owner) &DCAControllerV2.Controller>) {
            self.controllerCap = controllerCap
        }

        access(FlowTransactionScheduler.Execute) fun executeTransaction(id: UInt64, data: AnyStruct?) {
            // 1. Parse loop config (official pattern)
            let config = data as! LoopConfig? ?? panic("LoopConfig required")

            // 2. Execute swap
            let swapResult = self.doSwap(planId: config.planId)

            if !swapResult.success {
                emit Failed(transactionId: id, planId: config.planId, reason: swapResult.error ?? "swap failed")
                return
            }

            // 3. Reschedule if plan still active (official pattern)
            var nextScheduled = false
            let controller = self.controllerCap.borrow()
            if controller != nil {
                let plan = controller!.borrowPlan(id: config.planId)
                if plan != nil && plan!.status == DCAPlanV2.PlanStatus.Active && !plan!.hasReachedMaxExecutions() {
                    nextScheduled = self.reschedule(config: config, data: data!)
                }
            }

            emit Executed(
                transactionId: id,
                planId: config.planId,
                amountIn: swapResult.amountIn ?? 0.0,
                amountOut: swapResult.amountOut ?? 0.0,
                nextScheduled: nextScheduled
            )
        }

        /// Execute the swap - simplified
        access(self) fun doSwap(planId: UInt64): SwapResult {
            let controller = self.controllerCap.borrow() ?? panic("No controller")
            let plan = controller.borrowPlan(id: planId) ?? panic("No plan")

            if !plan.isReadyForExecution() || plan.hasReachedMaxExecutions() {
                return SwapResult(success: false, amountIn: nil, amountOut: nil, error: "not ready")
            }

            let sourceVaultCap = controller.getSourceVaultCapability() ?? panic("no source")
            let targetVaultCap = controller.getTargetVaultCapability() ?? panic("no target")

            let sourceVault = sourceVaultCap.borrow() ?? panic("borrow source")
            let amountIn = plan.amountPerInterval

            if sourceVault.balance < amountIn {
                return SwapResult(success: false, amountIn: nil, amountOut: nil, error: "insufficient balance")
            }

            let tokensToSwap <- sourceVault.withdraw(amount: amountIn)

            // Build path
            let sourceTypeId = plan.sourceTokenType.identifier
            let targetTypeId = plan.targetTokenType.identifier
            let tokenPath: [String] = []

            if sourceTypeId.contains("EVMVMBridgedToken") && targetTypeId.contains("FlowToken") {
                tokenPath.append("A.1e4aa0b87d10b141.EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14")
                tokenPath.append("A.1654653399040a61.FlowToken")
            } else if targetTypeId.contains("EVMVMBridgedToken") && sourceTypeId.contains("FlowToken") {
                tokenPath.append("A.1654653399040a61.FlowToken")
                tokenPath.append("A.1e4aa0b87d10b141.EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14")
            } else {
                destroy tokensToSwap
                return SwapResult(success: false, amountIn: nil, amountOut: nil, error: "unsupported pair")
            }

            let expectedOut = SwapRouter.getAmountsOut(amountIn: amountIn, tokenKeyPath: tokenPath)
            let minOut = expectedOut[expectedOut.length - 1] * (10000.0 - UFix64(plan.maxSlippageBps)) / 10000.0

            let swapped <- SwapRouter.swapExactTokensForTokens(
                exactVaultIn: <-tokensToSwap,
                amountOutMin: minOut,
                tokenKeyPath: tokenPath,
                deadline: getCurrentBlock().timestamp + 300.0
            )

            let amountOut = swapped.balance
            let targetVault = targetVaultCap.borrow() ?? panic("borrow target")
            targetVault.deposit(from: <-swapped)

            // Record execution
            plan.recordExecution(amountIn: amountIn, amountOut: amountOut)
            plan.scheduleNextExecution()

            return SwapResult(success: true, amountIn: amountIn, amountOut: amountOut, error: nil)
        }

        /// Reschedule - follows official pattern exactly
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
            let feeVault = config.feeProviderCap.borrow() ?? panic("fee provider")
            let fees <- feeVault.withdraw(amount: estimate.flowFee ?? 0.0)

            let manager = config.schedulerManagerCap.borrow() ?? panic("manager")

            manager.scheduleByHandler(
                handlerTypeIdentifier: self.getType().identifier,
                handlerUUID: self.uuid,
                data: data,
                timestamp: future,
                priority: config.priority,
                executionEffort: config.executionEffort,
                fees: <-fees as! @FlowToken.Vault
            )

            return true
        }
    }

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

    access(all) fun createHandler(
        controllerCap: Capability<auth(DCAControllerV2.Owner) &DCAControllerV2.Controller>
    ): @Handler {
        return <- create Handler(controllerCap: controllerCap)
    }

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
