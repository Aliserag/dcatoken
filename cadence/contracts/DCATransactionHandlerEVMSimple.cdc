import "FlowTransactionScheduler"
import "DCAControllerUnified"
import "DCAPlanUnified"
import "FungibleToken"
import "FlowToken"
import "EVM"

/// DCATransactionHandlerEVMSimple: Minimal EVM handler (~100 lines)
/// Tests if scheduler can execute EVM swaps at all
/// NO autonomous rescheduling - just executes FLOW → USDF via COA
access(all) contract DCATransactionHandlerEVMSimple {

    access(all) struct SimpleData {
        access(all) let planId: UInt64
        init(planId: UInt64) { self.planId = planId }
    }

    access(all) event Started(transactionId: UInt64, planId: UInt64)
    access(all) event Completed(transactionId: UInt64, planId: UInt64, amountIn: UFix64)
    access(all) event Failed(transactionId: UInt64, planId: UInt64, reason: String)

    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {
        access(self) let controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>

        init(controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>) {
            pre { controllerCap.check(): "Invalid controller" }
            self.controllerCap = controllerCap
        }

        access(FlowTransactionScheduler.Execute) fun executeTransaction(id: UInt64, data: AnyStruct?) {
            let txData = data as! SimpleData? ?? panic("SimpleData required")
            emit Started(transactionId: id, planId: txData.planId)

            let controller = self.controllerCap.borrow() ?? panic("No controller")
            let plan = controller.borrowPlan(id: txData.planId) ?? panic("No plan")

            // Get COA
            let coaCap = controller.getCOACapability()
            if coaCap == nil || !coaCap!.check() {
                emit Failed(transactionId: id, planId: txData.planId, reason: "No COA")
                return
            }
            let coa = coaCap!.borrow()!

            // Get source vault and check balance
            let sourceVaultCap = controller.getSourceVaultCapability()
                ?? panic("No source vault")
            let sourceVault = sourceVaultCap.borrow()
                ?? panic("Cannot borrow source")

            let amountIn = plan.amountPerInterval
            if sourceVault.balance < amountIn {
                emit Failed(transactionId: id, planId: txData.planId, reason: "Insufficient balance")
                return
            }

            // Withdraw FLOW and deposit to COA
            let flowToSwap <- sourceVault.withdraw(amount: amountIn) as! @FlowToken.Vault
            coa.deposit(from: <-flowToSwap)

            // Simple test: just deposit to COA and emit success
            // In production, would call UniswapV3 router here

            // Record execution
            plan.recordExecution(amountIn: amountIn, amountOut: 0.0)

            emit Completed(transactionId: id, planId: txData.planId, amountIn: amountIn)
        }

        access(all) view fun getViews(): [Type] {
            return [Type<StoragePath>()]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            return /storage/DCATransactionHandlerEVMSimple
        }
    }

    access(all) fun createHandler(
        controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>
    ): @Handler {
        return <- create Handler(controllerCap: controllerCap)
    }

    access(all) fun createData(planId: UInt64): SimpleData {
        return SimpleData(planId: planId)
    }
}
