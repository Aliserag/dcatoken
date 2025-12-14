import EVM from "EVM"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"

/// DCAServiceEVM: EVM-Native DCA Service with Shared COA
///
/// Implements Flow CTO's recommended architecture:
/// - Single shared COA embedded in contract handles all DCA executions
/// - Users only interact via Metamask (ERC-20 approve)
/// - Backend creates plans using deployer key
///
access(all) contract DCAServiceEVM {

    // ============================================================
    // Events
    // ============================================================

    access(all) event ContractInitialized(coaAddress: String)
    access(all) event PlanCreated(
        planId: UInt64,
        userEVMAddress: String,
        sourceToken: String,
        targetToken: String,
        amountPerInterval: UInt256,
        intervalSeconds: UInt64
    )
    access(all) event PlanExecuted(
        planId: UInt64,
        userEVMAddress: String,
        amountIn: UInt256,
        amountOut: UInt256,
        executionCount: UInt64
    )
    access(all) event PlanPaused(planId: UInt64)
    access(all) event PlanResumed(planId: UInt64, nextExecutionTime: UFix64)
    access(all) event PlanCancelled(planId: UInt64)
    access(all) event ExecutionFailed(planId: UInt64, reason: String)
    access(all) event InsufficientAllowance(planId: UInt64, required: UInt256, available: UInt256)

    // ============================================================
    // State
    // ============================================================

    access(self) let coa: @EVM.CadenceOwnedAccount
    access(self) let plans: {UInt64: PlanData}
    access(all) var nextPlanId: UInt64
    access(all) let adminAddress: Address
    access(all) let routerAddress: EVM.EVMAddress
    access(all) let wflowAddress: EVM.EVMAddress

    // ============================================================
    // Plan Status Enum
    // ============================================================

    access(all) enum PlanStatus: UInt8 {
        access(all) case Active
        access(all) case Paused
        access(all) case Completed
        access(all) case Cancelled
    }

    // ============================================================
    // Plan Data Struct (simple struct with all public fields)
    // ============================================================

    access(all) struct PlanData {
        access(all) let id: UInt64
        access(all) let userEVMAddressBytes: [UInt8; 20]
        access(all) let sourceTokenBytes: [UInt8; 20]
        access(all) let targetTokenBytes: [UInt8; 20]
        access(all) let amountPerInterval: UInt256
        access(all) let intervalSeconds: UInt64
        access(all) let maxSlippageBps: UInt64
        access(all) let maxExecutions: UInt64?
        access(all) let feeTier: UInt32
        access(all) let createdAt: UFix64

        // Mutable state stored separately
        access(all) let statusRaw: UInt8
        access(all) let nextExecutionTime: UFix64?
        access(all) let executionCount: UInt64
        access(all) let totalSourceSpent: UInt256
        access(all) let totalTargetReceived: UInt256

        access(all) fun getStatus(): PlanStatus {
            return PlanStatus(rawValue: self.statusRaw) ?? PlanStatus.Active
        }

        access(all) fun getUserEVMAddress(): EVM.EVMAddress {
            return EVM.EVMAddress(bytes: self.userEVMAddressBytes)
        }

        access(all) fun getSourceToken(): EVM.EVMAddress {
            return EVM.EVMAddress(bytes: self.sourceTokenBytes)
        }

        access(all) fun getTargetToken(): EVM.EVMAddress {
            return EVM.EVMAddress(bytes: self.targetTokenBytes)
        }

        init(
            id: UInt64,
            userEVMAddress: EVM.EVMAddress,
            sourceToken: EVM.EVMAddress,
            targetToken: EVM.EVMAddress,
            amountPerInterval: UInt256,
            intervalSeconds: UInt64,
            maxSlippageBps: UInt64,
            maxExecutions: UInt64?,
            feeTier: UInt32,
            firstExecutionTime: UFix64?,
            statusRaw: UInt8,
            executionCount: UInt64,
            totalSourceSpent: UInt256,
            totalTargetReceived: UInt256
        ) {
            self.id = id
            self.userEVMAddressBytes = userEVMAddress.bytes
            self.sourceTokenBytes = sourceToken.bytes
            self.targetTokenBytes = targetToken.bytes
            self.amountPerInterval = amountPerInterval
            self.intervalSeconds = intervalSeconds
            self.maxSlippageBps = maxSlippageBps
            self.maxExecutions = maxExecutions
            self.feeTier = feeTier
            self.createdAt = getCurrentBlock().timestamp
            self.statusRaw = statusRaw
            self.nextExecutionTime = firstExecutionTime
            self.executionCount = executionCount
            self.totalSourceSpent = totalSourceSpent
            self.totalTargetReceived = totalTargetReceived
        }
    }

    // ============================================================
    // Public View Functions
    // ============================================================

    access(all) view fun getCOAAddress(): EVM.EVMAddress {
        return self.coa.address()
    }

    access(all) view fun getPlan(planId: UInt64): PlanData? {
        return self.plans[planId]
    }

    access(all) fun getUserPlans(userEVMAddress: EVM.EVMAddress): [PlanData] {
        let result: [PlanData] = []
        let targetAddrLower = userEVMAddress.toString().toLower()
        for planId in self.plans.keys {
            if let plan = self.plans[planId] {
                if plan.getUserEVMAddress().toString().toLower() == targetAddrLower {
                    result.append(plan)
                }
            }
        }
        return result
    }

    access(all) view fun getTotalPlans(): Int {
        return self.plans.length
    }

    access(all) fun checkAllowance(
        userEVMAddress: EVM.EVMAddress,
        tokenAddress: EVM.EVMAddress
    ): UInt256 {
        let calldata = EVM.encodeABIWithSignature(
            "allowance(address,address)",
            [userEVMAddress, self.coa.address()]
        )
        let result = self.coa.call(
            to: tokenAddress,
            data: calldata,
            gasLimit: 50_000,
            value: EVM.Balance(attoflow: 0)
        )
        if result.status == EVM.Status.successful && result.data.length >= 32 {
            let decoded = EVM.decodeABI(types: [Type<UInt256>()], data: result.data)
            if decoded.length > 0 {
                return decoded[0] as! UInt256
            }
        }
        return 0
    }

    // ============================================================
    // Plan Management
    // ============================================================

    access(all) fun createPlan(
        userEVMAddress: EVM.EVMAddress,
        sourceToken: EVM.EVMAddress,
        targetToken: EVM.EVMAddress,
        amountPerInterval: UInt256,
        intervalSeconds: UInt64,
        maxSlippageBps: UInt64,
        maxExecutions: UInt64?,
        feeTier: UInt32,
        firstExecutionTime: UFix64
    ): UInt64 {
        pre {
            amountPerInterval > 0: "Amount must be positive"
            intervalSeconds > 0: "Interval must be positive"
            maxSlippageBps <= 5000: "Max slippage cannot exceed 50%"
            firstExecutionTime > getCurrentBlock().timestamp: "First execution must be in future"
        }

        let planId = self.nextPlanId
        self.nextPlanId = self.nextPlanId + 1

        let plan = PlanData(
            id: planId,
            userEVMAddress: userEVMAddress,
            sourceToken: sourceToken,
            targetToken: targetToken,
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds,
            maxSlippageBps: maxSlippageBps,
            maxExecutions: maxExecutions,
            feeTier: feeTier,
            firstExecutionTime: firstExecutionTime,
            statusRaw: PlanStatus.Active.rawValue,
            executionCount: 0,
            totalSourceSpent: 0,
            totalTargetReceived: 0
        )

        self.plans[planId] = plan

        emit PlanCreated(
            planId: planId,
            userEVMAddress: userEVMAddress.toString(),
            sourceToken: sourceToken.toString(),
            targetToken: targetToken.toString(),
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds
        )

        return planId
    }

    access(all) fun pausePlan(planId: UInt64) {
        let plan = self.plans[planId] ?? panic("Plan not found")
        self.plans[planId] = PlanData(
            id: plan.id,
            userEVMAddress: plan.getUserEVMAddress(),
            sourceToken: plan.getSourceToken(),
            targetToken: plan.getTargetToken(),
            amountPerInterval: plan.amountPerInterval,
            intervalSeconds: plan.intervalSeconds,
            maxSlippageBps: plan.maxSlippageBps,
            maxExecutions: plan.maxExecutions,
            feeTier: plan.feeTier,
            firstExecutionTime: nil,
            statusRaw: PlanStatus.Paused.rawValue,
            executionCount: plan.executionCount,
            totalSourceSpent: plan.totalSourceSpent,
            totalTargetReceived: plan.totalTargetReceived
        )
        emit PlanPaused(planId: planId)
    }

    access(all) fun resumePlan(planId: UInt64, nextExecTime: UFix64?) {
        let plan = self.plans[planId] ?? panic("Plan not found")
        let execTime = nextExecTime ?? (getCurrentBlock().timestamp + UFix64(plan.intervalSeconds))
        self.plans[planId] = PlanData(
            id: plan.id,
            userEVMAddress: plan.getUserEVMAddress(),
            sourceToken: plan.getSourceToken(),
            targetToken: plan.getTargetToken(),
            amountPerInterval: plan.amountPerInterval,
            intervalSeconds: plan.intervalSeconds,
            maxSlippageBps: plan.maxSlippageBps,
            maxExecutions: plan.maxExecutions,
            feeTier: plan.feeTier,
            firstExecutionTime: execTime,
            statusRaw: PlanStatus.Active.rawValue,
            executionCount: plan.executionCount,
            totalSourceSpent: plan.totalSourceSpent,
            totalTargetReceived: plan.totalTargetReceived
        )
        emit PlanResumed(planId: planId, nextExecutionTime: execTime)
    }

    access(all) fun cancelPlan(planId: UInt64) {
        let plan = self.plans[planId] ?? panic("Plan not found")
        self.plans[planId] = PlanData(
            id: plan.id,
            userEVMAddress: plan.getUserEVMAddress(),
            sourceToken: plan.getSourceToken(),
            targetToken: plan.getTargetToken(),
            amountPerInterval: plan.amountPerInterval,
            intervalSeconds: plan.intervalSeconds,
            maxSlippageBps: plan.maxSlippageBps,
            maxExecutions: plan.maxExecutions,
            feeTier: plan.feeTier,
            firstExecutionTime: nil,
            statusRaw: PlanStatus.Cancelled.rawValue,
            executionCount: plan.executionCount,
            totalSourceSpent: plan.totalSourceSpent,
            totalTargetReceived: plan.totalTargetReceived
        )
        emit PlanCancelled(planId: planId)
    }

    // ============================================================
    // Execution
    // ============================================================

    access(all) fun executePlan(planId: UInt64): Bool {
        let planOpt = self.plans[planId]
        if planOpt == nil {
            emit ExecutionFailed(planId: planId, reason: "Plan not found")
            return false
        }
        let plan = planOpt!

        if plan.getStatus() != PlanStatus.Active {
            emit ExecutionFailed(planId: planId, reason: "Plan not active")
            return false
        }

        if let maxExec = plan.maxExecutions {
            if plan.executionCount >= maxExec {
                self.updatePlanStatus(planId: planId, status: PlanStatus.Completed, nextExecTime: nil)
                emit ExecutionFailed(planId: planId, reason: "Max executions reached")
                return false
            }
        }

        let userAddr = plan.getUserEVMAddress()
        let sourceToken = plan.getSourceToken()
        let targetToken = plan.getTargetToken()

        let allowance = self.checkAllowance(userEVMAddress: userAddr, tokenAddress: sourceToken)
        if allowance < plan.amountPerInterval {
            emit InsufficientAllowance(planId: planId, required: plan.amountPerInterval, available: allowance)
            return false
        }

        let pullSuccess = self.pullTokens(from: userAddr, token: sourceToken, amount: plan.amountPerInterval)
        if !pullSuccess {
            emit ExecutionFailed(planId: planId, reason: "Failed to pull tokens")
            return false
        }

        let amountOut = self.executeSwap(
            tokenIn: sourceToken,
            tokenOut: targetToken,
            amountIn: plan.amountPerInterval,
            minAmountOut: 0,
            feeTier: plan.feeTier
        )
        if amountOut == 0 {
            let _ = self.sendTokens(to: userAddr, token: sourceToken, amount: plan.amountPerInterval)
            emit ExecutionFailed(planId: planId, reason: "Swap failed")
            return false
        }

        let sendSuccess = self.sendTokens(to: userAddr, token: targetToken, amount: amountOut)
        if !sendSuccess {
            emit ExecutionFailed(planId: planId, reason: "Failed to send tokens")
            return false
        }

        // Update plan with new execution stats
        let newExecCount = plan.executionCount + 1
        let newSourceSpent = plan.totalSourceSpent + plan.amountPerInterval
        let newTargetReceived = plan.totalTargetReceived + amountOut

        var newStatus = PlanStatus.Active.rawValue
        var newNextExecTime: UFix64? = getCurrentBlock().timestamp + UFix64(plan.intervalSeconds)

        if let maxExec = plan.maxExecutions {
            if newExecCount >= maxExec {
                newStatus = PlanStatus.Completed.rawValue
                newNextExecTime = nil
            }
        }

        self.plans[planId] = PlanData(
            id: plan.id,
            userEVMAddress: userAddr,
            sourceToken: sourceToken,
            targetToken: targetToken,
            amountPerInterval: plan.amountPerInterval,
            intervalSeconds: plan.intervalSeconds,
            maxSlippageBps: plan.maxSlippageBps,
            maxExecutions: plan.maxExecutions,
            feeTier: plan.feeTier,
            firstExecutionTime: newNextExecTime,
            statusRaw: newStatus,
            executionCount: newExecCount,
            totalSourceSpent: newSourceSpent,
            totalTargetReceived: newTargetReceived
        )

        emit PlanExecuted(
            planId: planId,
            userEVMAddress: userAddr.toString(),
            amountIn: plan.amountPerInterval,
            amountOut: amountOut,
            executionCount: newExecCount
        )

        return true
    }

    access(self) fun updatePlanStatus(planId: UInt64, status: PlanStatus, nextExecTime: UFix64?) {
        let plan = self.plans[planId]!
        self.plans[planId] = PlanData(
            id: plan.id,
            userEVMAddress: plan.getUserEVMAddress(),
            sourceToken: plan.getSourceToken(),
            targetToken: plan.getTargetToken(),
            amountPerInterval: plan.amountPerInterval,
            intervalSeconds: plan.intervalSeconds,
            maxSlippageBps: plan.maxSlippageBps,
            maxExecutions: plan.maxExecutions,
            feeTier: plan.feeTier,
            firstExecutionTime: nextExecTime,
            statusRaw: status.rawValue,
            executionCount: plan.executionCount,
            totalSourceSpent: plan.totalSourceSpent,
            totalTargetReceived: plan.totalTargetReceived
        )
    }

    // ============================================================
    // EVM Interaction
    // ============================================================

    access(self) fun pullTokens(from: EVM.EVMAddress, token: EVM.EVMAddress, amount: UInt256): Bool {
        let calldata = EVM.encodeABIWithSignature(
            "transferFrom(address,address,uint256)",
            [from, self.coa.address(), amount]
        )
        let result = self.coa.call(to: token, data: calldata, gasLimit: 100_000, value: EVM.Balance(attoflow: 0))
        return result.status == EVM.Status.successful
    }

    access(self) fun sendTokens(to: EVM.EVMAddress, token: EVM.EVMAddress, amount: UInt256): Bool {
        let calldata = EVM.encodeABIWithSignature("transfer(address,uint256)", [to, amount])
        let result = self.coa.call(to: token, data: calldata, gasLimit: 100_000, value: EVM.Balance(attoflow: 0))
        return result.status == EVM.Status.successful
    }

    access(self) fun executeSwap(
        tokenIn: EVM.EVMAddress,
        tokenOut: EVM.EVMAddress,
        amountIn: UInt256,
        minAmountOut: UInt256,
        feeTier: UInt32
    ): UInt256 {
        // Approve router
        let approveData = EVM.encodeABIWithSignature("approve(address,uint256)", [self.routerAddress, amountIn])
        let approveResult = self.coa.call(to: tokenIn, data: approveData, gasLimit: 100_000, value: EVM.Balance(attoflow: 0))
        if approveResult.status != EVM.Status.successful { return 0 }

        // Build path: tokenIn + fee + tokenOut
        var pathBytes: [UInt8] = []
        for byte in tokenIn.bytes { pathBytes.append(byte) }
        pathBytes.append(UInt8((feeTier >> 16) & 0xFF))
        pathBytes.append(UInt8((feeTier >> 8) & 0xFF))
        pathBytes.append(UInt8(feeTier & 0xFF))
        for byte in tokenOut.bytes { pathBytes.append(byte) }

        // exactInput selector: 0xb858183f
        let selector: [UInt8] = [0xb8, 0x58, 0x18, 0x3f]
        let tupleData = self.encodeExactInputParams(pathBytes: pathBytes, recipient: self.coa.address(), amountIn: amountIn, amountOutMin: minAmountOut)
        let head = self.abiUInt256(32)
        let calldata = selector.concat(head).concat(tupleData)

        let swapResult = self.coa.call(to: self.routerAddress, data: calldata, gasLimit: 500_000, value: EVM.Balance(attoflow: 0))

        if swapResult.status == EVM.Status.successful && swapResult.data.length >= 32 {
            let decoded = EVM.decodeABI(types: [Type<UInt256>()], data: swapResult.data)
            if decoded.length > 0 { return decoded[0] as! UInt256 }
        }
        return 0
    }

    // ============================================================
    // ABI Helpers
    // ============================================================

    access(self) fun abiUInt256(_ value: UInt256): [UInt8] {
        var result: [UInt8] = []
        var remaining = value
        var bytes: [UInt8] = []
        if remaining == 0 { bytes.append(0) }
        else { while remaining > 0 { bytes.append(UInt8(remaining % 256)); remaining = remaining / 256 } }
        while bytes.length < 32 { bytes.append(0) }
        var i = 31
        while i >= 0 { result.append(bytes[i]); if i == 0 { break }; i = i - 1 }
        return result
    }

    access(self) fun abiAddress(_ addr: EVM.EVMAddress): [UInt8] {
        var result: [UInt8] = []
        var i = 0
        while i < 12 { result.append(0); i = i + 1 }
        for byte in addr.bytes { result.append(byte) }
        return result
    }

    access(self) fun abiDynamicBytes(_ data: [UInt8]): [UInt8] {
        var result: [UInt8] = []
        result = result.concat(self.abiUInt256(UInt256(data.length)))
        result = result.concat(data)
        let padding = (32 - (data.length % 32)) % 32
        var i = 0
        while i < padding { result.append(0); i = i + 1 }
        return result
    }

    access(self) fun encodeExactInputParams(pathBytes: [UInt8], recipient: EVM.EVMAddress, amountIn: UInt256, amountOutMin: UInt256): [UInt8] {
        let tupleHeadSize = 32 * 4
        var head: [[UInt8]] = []
        var tail: [[UInt8]] = []
        head.append(self.abiUInt256(UInt256(tupleHeadSize)))
        tail.append(self.abiDynamicBytes(pathBytes))
        head.append(self.abiAddress(recipient))
        head.append(self.abiUInt256(amountIn))
        head.append(self.abiUInt256(amountOutMin))
        var result: [UInt8] = []
        for part in head { result = result.concat(part) }
        for part in tail { result = result.concat(part) }
        return result
    }

    // ============================================================
    // Gas Management
    // ============================================================

    access(all) fun depositGas(vault: @{FungibleToken.Vault}) {
        pre { vault.isInstance(Type<@FlowToken.Vault>()): "Must deposit FLOW" }
        self.coa.deposit(from: <- (vault as! @FlowToken.Vault))
    }

    access(all) view fun getCOABalance(): UFix64 {
        return self.coa.balance().inFLOW()
    }

    // ============================================================
    // Init
    // ============================================================

    init() {
        self.coa <- EVM.createCadenceOwnedAccount()
        self.plans = {}
        self.nextPlanId = 1
        self.adminAddress = self.account.address
        self.routerAddress = EVM.addressFromString("0xeEDC6Ff75e1b10B903D9013c358e446a73d35341")
        self.wflowAddress = EVM.addressFromString("0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e")
        emit ContractInitialized(coaAddress: self.coa.address().toString())
    }
}
