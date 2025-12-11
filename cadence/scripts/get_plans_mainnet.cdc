import DCAControllerV2 from 0xca7ee55e4fc3251a
import DCAPlanV2 from 0xca7ee55e4fc3251a

access(all) struct PlanInfo {
    access(all) let id: UInt64
    access(all) let status: String
    access(all) let amountPerInterval: UFix64
    access(all) let intervalSeconds: UFix64
    access(all) let executionCount: UInt64
    access(all) let maxExecutions: UInt64?
    access(all) let sourceTokenType: String
    access(all) let targetTokenType: String

    init(
        id: UInt64,
        status: String,
        amountPerInterval: UFix64,
        intervalSeconds: UFix64,
        executionCount: UInt64,
        maxExecutions: UInt64?,
        sourceTokenType: String,
        targetTokenType: String
    ) {
        self.id = id
        self.status = status
        self.amountPerInterval = amountPerInterval
        self.intervalSeconds = intervalSeconds
        self.executionCount = executionCount
        self.maxExecutions = maxExecutions
        self.sourceTokenType = sourceTokenType
        self.targetTokenType = targetTokenType
    }
}

access(all) fun main(address: Address): [PlanInfo] {
    let account = getAccount(address)

    let controllerCap = account.capabilities.get<&DCAControllerV2.Controller>(
        DCAControllerV2.ControllerPublicPath
    )

    if !controllerCap.check() {
        return []
    }

    let controller = controllerCap.borrow()!
    let plans: [PlanInfo] = []

    for planId in controller.getPlanIDs() {
        if let planRef = controller.borrowPlan(planId: planId) {
            let statusStr = planRef.status == DCAPlanV2.PlanStatus.active ? "active" :
                           planRef.status == DCAPlanV2.PlanStatus.paused ? "paused" : "completed"

            plans.append(PlanInfo(
                id: planRef.uuid,
                status: statusStr,
                amountPerInterval: planRef.amountPerInterval,
                intervalSeconds: planRef.intervalSeconds,
                executionCount: planRef.executionCount,
                maxExecutions: planRef.maxExecutions,
                sourceTokenType: planRef.sourceTokenType.identifier,
                targetTokenType: planRef.targetTokenType.identifier
            ))
        }
    }

    return plans
}
