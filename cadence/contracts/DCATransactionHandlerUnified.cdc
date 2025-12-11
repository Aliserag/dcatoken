import "FlowTransactionScheduler"
import "FlowTransactionSchedulerUtils"
import "DCAControllerUnified"
import "DCAPlanUnified"
import "FungibleToken"
import "FlowToken"
import "SwapRouter"
import "EVM"
import "UniswapV3SwapperConnector"
import "DeFiActions"

/// DCATransactionHandlerUnified: Unified DCA Handler with Auto-Rescheduling
///
/// Combines V2Loop's proven pattern with EVM swap support:
/// - LoopConfig with feeProviderCap in data (scheduler-compatible)
/// - Token-type detection for swap routing
/// - IncrementFi for Cadence tokens (USDC), UniswapV3 for EVM tokens (USDF)
///
/// Storage: /storage/DCATransactionHandlerUnified
access(all) contract DCATransactionHandlerUnified {

    /// LoopConfig - proven pattern from CounterLoopTransactionHandler
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
        swapType: String,
        nextScheduled: Bool
    )

    access(all) event Failed(
        transactionId: UInt64,
        planId: UInt64,
        reason: String
    )

    access(all) struct SwapResult {
        access(all) let success: Bool
        access(all) let amountIn: UFix64?
        access(all) let amountOut: UFix64?
        access(all) let swapType: String
        access(all) let error: String?

        init(success: Bool, amountIn: UFix64?, amountOut: UFix64?, swapType: String, error: String?) {
            self.success = success
            self.amountIn = amountIn
            self.amountOut = amountOut
            self.swapType = swapType
            self.error = error
        }
    }

    /// Handler resource
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {
        access(self) let controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>

        init(controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>) {
            self.controllerCap = controllerCap
        }

        access(FlowTransactionScheduler.Execute) fun executeTransaction(id: UInt64, data: AnyStruct?) {
            let config = data as! LoopConfig? ?? panic("LoopConfig required")

            // Execute swap with auto-routing
            let swapResult = self.doSwap(planId: config.planId)

            if !swapResult.success {
                emit Failed(transactionId: id, planId: config.planId, reason: swapResult.error ?? "swap failed")
                return
            }

            // Reschedule if plan still active
            var nextScheduled = false
            let controller = self.controllerCap.borrow()
            if controller != nil {
                let plan = controller!.borrowPlan(id: config.planId)
                if plan != nil && plan!.status == DCAPlanUnified.PlanStatus.Active && !plan!.hasReachedMaxExecutions() {
                    nextScheduled = self.reschedule(config: config, data: data!)
                }
            }

            emit Executed(
                transactionId: id,
                planId: config.planId,
                amountIn: swapResult.amountIn ?? 0.0,
                amountOut: swapResult.amountOut ?? 0.0,
                swapType: swapResult.swapType,
                nextScheduled: nextScheduled
            )
        }

        /// Execute swap with auto-routing based on token types
        access(self) fun doSwap(planId: UInt64): SwapResult {
            let controller = self.controllerCap.borrow() ?? panic("No controller")
            let plan = controller.borrowPlan(id: planId) ?? panic("No plan")

            if !plan.isReadyForExecution() || plan.hasReachedMaxExecutions() {
                return SwapResult(success: false, amountIn: nil, amountOut: nil, swapType: "none", error: "not ready")
            }

            // Route based on token type
            if plan.requiresEVM() {
                return self.executeEVMSwap(controller: controller, plan: plan)
            } else {
                return self.executeCadenceSwap(controller: controller, plan: plan)
            }
        }

        /// Execute Cadence-native swap via IncrementFi SwapRouter
        access(self) fun executeCadenceSwap(
            controller: auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller,
            plan: &DCAPlanUnified.Plan
        ): SwapResult {
            let sourceVaultCap = controller.getSourceVaultCapability() ?? panic("no source")
            let targetVaultCap = controller.getTargetVaultCapability() ?? panic("no target")

            let sourceVault = sourceVaultCap.borrow() ?? panic("borrow source")
            let amountIn = plan.amountPerInterval

            if sourceVault.balance < amountIn {
                return SwapResult(success: false, amountIn: nil, amountOut: nil, swapType: "Cadence", error: "insufficient balance")
            }

            let tokensToSwap <- sourceVault.withdraw(amount: amountIn)

            // Build token path for IncrementFi
            let sourceTypeId = plan.sourceTokenType.identifier
            let targetTypeId = plan.targetTokenType.identifier
            var tokenPath: [String] = []

            // USDC token contract on mainnet
            let usdcTypeId = "A.1e4aa0b87d10b141.EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14"
            let flowTypeId = "A.1654653399040a61.FlowToken"

            if sourceTypeId.contains("FlowToken") && targetTypeId.contains("EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14") {
                // FLOW -> USDC
                tokenPath = [flowTypeId, usdcTypeId]
            } else if sourceTypeId.contains("EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14") && targetTypeId.contains("FlowToken") {
                // USDC -> FLOW
                tokenPath = [usdcTypeId, flowTypeId]
            } else {
                destroy tokensToSwap
                return SwapResult(success: false, amountIn: nil, amountOut: nil, swapType: "Cadence", error: "unsupported pair for Cadence swap")
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

            plan.recordExecution(amountIn: amountIn, amountOut: amountOut)
            plan.scheduleNextExecution()

            return SwapResult(success: true, amountIn: amountIn, amountOut: amountOut, swapType: "Cadence/IncrementFi", error: nil)
        }

        /// Execute EVM swap via UniswapV3 COA
        access(self) fun executeEVMSwap(
            controller: auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller,
            plan: &DCAPlanUnified.Plan
        ): SwapResult {
            let sourceVaultCap = controller.getSourceVaultCapability() ?? panic("no source")
            let targetVaultCap = controller.getTargetVaultCapability() ?? panic("no target")
            let coaCap = controller.getCOACapability() ?? panic("no COA for EVM swap")

            let sourceVault = sourceVaultCap.borrow() ?? panic("borrow source")
            let amountIn = plan.amountPerInterval

            if sourceVault.balance < amountIn {
                return SwapResult(success: false, amountIn: nil, amountOut: nil, swapType: "EVM", error: "insufficient balance")
            }

            let tokensToSwap <- sourceVault.withdraw(amount: amountIn)

            // Determine token path and types for EVM swap
            let sourceTypeId = plan.sourceTokenType.identifier
            let targetTypeId = plan.targetTokenType.identifier

            // USDF token contract (EVM-bridged)
            let usdfEVMAddress = EVM.addressFromString("0x2aabea2058b5ac2d339b163c6ab6f2b6d53aabed")
            // WFLOW on EVM
            let wflowEVMAddress = EVM.addressFromString("0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e")

            var tokenPath: [EVM.EVMAddress] = []
            var inVaultType: Type = plan.sourceTokenType
            var outVaultType: Type = plan.targetTokenType

            if sourceTypeId.contains("FlowToken") {
                // FLOW -> USDF
                tokenPath = [wflowEVMAddress, usdfEVMAddress]
            } else if targetTypeId.contains("FlowToken") {
                // USDF -> FLOW
                tokenPath = [usdfEVMAddress, wflowEVMAddress]
            } else {
                destroy tokensToSwap
                return SwapResult(success: false, amountIn: nil, amountOut: nil, swapType: "EVM", error: "unsupported pair for EVM swap")
            }

            // Create swapper with 0.3% fee tier (3000)
            let swapper <- UniswapV3SwapperConnector.createSwapperWithDefaults(
                tokenPath: tokenPath,
                feePath: [3000],
                inVaultType: inVaultType,
                outVaultType: outVaultType,
                coaCapability: coaCap
            )

            // Get quote with slippage
            let quote = swapper.getQuote(
                fromTokenType: inVaultType,
                toTokenType: outVaultType,
                amount: amountIn
            )

            // Apply plan's slippage
            let adjustedMinAmount = quote.expectedAmount * (10000.0 - UFix64(plan.maxSlippageBps)) / 10000.0
            let adjustedQuote = DeFiActions.Quote(
                expectedAmount: quote.expectedAmount,
                minAmount: adjustedMinAmount,
                slippageTolerance: UFix64(plan.maxSlippageBps) / 10000.0,
                deadline: nil,
                data: quote.data
            )

            // Execute swap
            let swapped <- swapper.swap(inVault: <-tokensToSwap, quote: adjustedQuote)
            let amountOut = swapped.balance

            // Deposit to target
            let targetVault = targetVaultCap.borrow() ?? panic("borrow target")
            targetVault.deposit(from: <-swapped)

            // Cleanup swapper
            destroy swapper

            plan.recordExecution(amountIn: amountIn, amountOut: amountOut)
            plan.scheduleNextExecution()

            return SwapResult(success: true, amountIn: amountIn, amountOut: amountOut, swapType: "EVM/UniswapV3", error: nil)
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

    access(all) fun createHandler(
        controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>
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
