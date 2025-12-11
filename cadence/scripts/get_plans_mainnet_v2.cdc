import DCAControllerV2 from 0xca7ee55e4fc3251a
import DCAPlanV2 from 0xca7ee55e4fc3251a

access(all) fun main(address: Address): [DCAPlanV2.PlanDetails] {
    let account = getAccount(address)

    let controllerCap = account.capabilities.get<&DCAControllerV2.Controller>(
        DCAControllerV2.ControllerPublicPath
    )

    if !controllerCap.check() {
        return []
    }

    let controller = controllerCap.borrow()!
    return controller.getAllPlans()
}
