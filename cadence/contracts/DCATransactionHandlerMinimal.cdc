import "FlowTransactionScheduler"
import "DCAControllerUnified"
import "DCAPlanUnified"
import "FungibleToken"
import "FlowToken"

/// DCATransactionHandlerMinimal: Absolutely minimal handler (~50 lines)
/// Tests if scheduler can execute Unified controller operations WITHOUT EVM
access(all) contract DCATransactionHandlerMinimal {

    access(all) struct SimpleData {
        access(all) let planId: UInt64
        init(planId: UInt64) { self.planId = planId }
    }

    access(all) event Started(transactionId: UInt64, planId: UInt64)
    access(all) event Completed(transactionId: UInt64, planId: UInt64)
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

            // Just record execution - NO swap, NO EVM
            plan.recordExecution(amountIn: plan.amountPerInterval, amountOut: 0.0)

            emit Completed(transactionId: id, planId: txData.planId)
        }

        access(all) view fun getViews(): [Type] { return [Type<StoragePath>()] }
        access(all) fun resolveView(_ view: Type): AnyStruct? { return /storage/DCATransactionHandlerMinimal }
    }

    access(all) fun createHandler(controllerCap: Capability<auth(DCAControllerUnified.Owner) &DCAControllerUnified.Controller>): @Handler {
        return <- create Handler(controllerCap: controllerCap)
    }

    access(all) fun createData(planId: UInt64): SimpleData { return SimpleData(planId: planId) }
}
