import "FlowTransactionScheduler"
import "DCAControllerUnified"
import "DCAPlanUnified"
import "FungibleToken"
import "FlowToken"
import "EVM"
import "DeFiActions"
import "UniswapV3SwapperConnector"

/// DCATransactionHandlerEVMMinimal: Incremental EVM swap handler
///
/// PURPOSE: Test EVM swap execution step by step
/// Step 3: Add UniswapV3 swap logic
///
/// Storage: /storage/DCATransactionHandlerEVMMinimal
access(all) contract DCATransactionHandlerEVMMinimal {

    /// Simple transaction data
    access(all) struct SimpleTransactionData {
        access(all) let planId: UInt64
        init(planId: UInt64) { self.planId = planId }
    }

    /// Events
    access(all) event HandlerExecuted(
        transactionId: UInt64,
        planId: UInt64,
        owner: Address,
        requiresEVM: Bool,
        timestamp: UFix64
    )

    access(all) event SwapCompleted(
        transactionId: UInt64,
        planId: UInt64,
        amountIn: UFix64,
        amountOut: UFix64
    )

    // Debug events for step-by-step tracing
    access(all) event DebugStep(step: String, transactionId: UInt64)
    access(all) event DebugQuote(expectedAmount: UFix64, transactionId: UInt64)

    /// Handler resource
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {
        access(self) let controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>

        init(controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>) {
            pre { controllerCap.check(): "Invalid controller capability" }
            self.controllerCap = controllerCap
        }

        access(FlowTransactionScheduler.Execute) fun executeTransaction(id: UInt64, data: AnyStruct?) {
            emit DebugStep(step: "1_start", transactionId: id)

            let timestamp = getCurrentBlock().timestamp
            let ownerAddress = self.controllerCap.address

            // Parse data
            let txData = data as? SimpleTransactionData
            if txData == nil {
                emit DebugStep(step: "FAIL_invalid_data", transactionId: id)
                return
            }
            let planId = txData!.planId

            emit DebugStep(step: "2_data_parsed", transactionId: id)

            // Borrow controller
            let controller = self.controllerCap.borrow()
            if controller == nil {
                emit DebugStep(step: "FAIL_no_controller", transactionId: id)
                return
            }

            emit DebugStep(step: "3_controller_borrowed", transactionId: id)

            // Borrow plan
            let planRef = controller!.borrowPlan(id: planId)
            if planRef == nil {
                emit DebugStep(step: "FAIL_no_plan", transactionId: id)
                return
            }

            emit DebugStep(step: "4_plan_borrowed", transactionId: id)

            let requiresEVM = planRef!.requiresEVM()

            if !requiresEVM {
                emit DebugStep(step: "5_not_evm_plan", transactionId: id)
                emit HandlerExecuted(transactionId: id, planId: planId, owner: ownerAddress, requiresEVM: false, timestamp: timestamp)
                return
            }

            emit DebugStep(step: "5_evm_plan_confirmed", transactionId: id)

            // Get COA capability
            let coaCap = controller!.getCOACapability()
            if coaCap == nil || !coaCap!.check() {
                emit DebugStep(step: "FAIL_coa_issue", transactionId: id)
                return
            }

            emit DebugStep(step: "6_coa_valid", transactionId: id)

            // Get source vault
            let sourceVaultCap = controller!.getSourceVaultCapability()
            if sourceVaultCap == nil || !sourceVaultCap!.check() {
                emit DebugStep(step: "FAIL_source_vault", transactionId: id)
                return
            }
            let sourceVault = sourceVaultCap!.borrow()!

            emit DebugStep(step: "7_source_vault_valid", transactionId: id)

            // Get target vault
            let targetVaultCap = controller!.getTargetVaultCapability()
            if targetVaultCap == nil || !targetVaultCap!.check() {
                emit DebugStep(step: "FAIL_target_vault", transactionId: id)
                return
            }

            emit DebugStep(step: "8_target_vault_valid", transactionId: id)

            let amountIn = planRef!.amountPerInterval
            if sourceVault.balance < amountIn {
                emit DebugStep(step: "FAIL_insufficient_balance", transactionId: id)
                return
            }

            emit DebugStep(step: "9_balance_ok", transactionId: id)

            // Withdraw FLOW for swap
            let tokensToSwap <- sourceVault.withdraw(amount: amountIn) as! @FlowToken.Vault

            emit DebugStep(step: "10_flow_withdrawn", transactionId: id)

            // Setup EVM addresses
            let usdfEVMAddress = EVM.addressFromString("0x2aabea2058b5ac2d339b163c6ab6f2b6d53aabed")
            let wflowEVMAddress = EVM.addressFromString("0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e")
            let tokenPath: [EVM.EVMAddress] = [wflowEVMAddress, usdfEVMAddress]

            emit DebugStep(step: "11_addresses_setup", transactionId: id)

            // Create swapper
            let swapper <- UniswapV3SwapperConnector.createSwapperWithDefaults(
                tokenPath: tokenPath,
                feePath: [3000],  // 0.3% fee tier
                inVaultType: planRef!.sourceTokenType,
                outVaultType: planRef!.targetTokenType,
                coaCapability: coaCap!
            )

            emit DebugStep(step: "12_swapper_created", transactionId: id)

            // Get quote
            let quote = swapper.getQuote(
                fromTokenType: planRef!.sourceTokenType,
                toTokenType: planRef!.targetTokenType,
                amount: amountIn
            )

            emit DebugStep(step: "13_quote_received", transactionId: id)
            emit DebugQuote(expectedAmount: quote.expectedAmount, transactionId: id)

            // Apply slippage
            let minAmount = quote.expectedAmount * (10000.0 - UFix64(planRef!.maxSlippageBps)) / 10000.0
            let adjustedQuote = DeFiActions.Quote(
                expectedAmount: quote.expectedAmount,
                minAmount: minAmount,
                slippageTolerance: UFix64(planRef!.maxSlippageBps) / 10000.0,
                deadline: nil,
                data: quote.data
            )

            emit DebugStep(step: "14_quote_adjusted", transactionId: id)

            // Execute swap
            let swapped <- swapper.swap(inVault: <-tokensToSwap, quote: adjustedQuote)
            let amountOut = swapped.balance

            emit DebugStep(step: "15_swap_executed", transactionId: id)

            // Deposit to target
            let targetVault = targetVaultCap!.borrow()!
            targetVault.deposit(from: <-swapped)

            emit DebugStep(step: "16_deposited", transactionId: id)

            // Cleanup
            destroy swapper

            emit HandlerExecuted(transactionId: id, planId: planId, owner: ownerAddress, requiresEVM: true, timestamp: timestamp)
            emit SwapCompleted(transactionId: id, planId: planId, amountIn: amountIn, amountOut: amountOut)

            emit DebugStep(step: "17_complete", transactionId: id)
        }

        access(all) view fun getViews(): [Type] {
            return [Type<StoragePath>()]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<StoragePath>():
                    return /storage/DCATransactionHandlerEVMMinimal
                default:
                    return nil
            }
        }
    }

    access(all) fun createHandler(
        controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>
    ): @Handler {
        return <- create Handler(controllerCap: controllerCap)
    }

    access(all) fun createTransactionData(planId: UInt64): SimpleTransactionData {
        return SimpleTransactionData(planId: planId)
    }
}
