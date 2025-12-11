import "DeFiMath"
import "FungibleToken"

/// DCAPlanUnified: Unified DCA Plan Resource
///
/// Supports both IncrementFi (USDC) and EVM DEX (USDF) swaps.
/// Token routing is determined by the handler at execution time.
///
/// Storage: /storage/DCAPlanUnified
access(all) contract DCAPlanUnified {

    access(all) event PlanCreated(
        planId: UInt64,
        owner: Address,
        sourceTokenType: String,
        targetTokenType: String,
        amountPerInterval: UFix64,
        intervalSeconds: UInt64,
        maxSlippageBps: UInt64
    )

    access(all) event PlanExecuted(
        planId: UInt64,
        executionCount: UInt64,
        amountIn: UFix64,
        amountOut: UFix64,
        executionPriceFP128: UInt128,
        newAvgPriceFP128: UInt128,
        timestamp: UFix64
    )

    access(all) event PlanUpdated(
        planId: UInt64,
        active: Bool,
        nextExecutionTime: UFix64?
    )

    access(all) event PlanPaused(planId: UInt64, timestamp: UFix64)
    access(all) event PlanResumed(planId: UInt64, nextExecutionTime: UFix64)

    access(all) let PlanStoragePath: StoragePath
    access(all) let PlanPublicPath: PublicPath

    access(all) var nextPlanId: UInt64

    access(all) enum PlanStatus: UInt8 {
        access(all) case Active
        access(all) case Paused
        access(all) case Completed
        access(all) case Cancelled
    }

    /// Helper to detect EVM-bridged tokens
    access(all) view fun isEVMToken(tokenType: Type): Bool {
        return tokenType.identifier.contains("EVMVMBridgedToken")
    }

    access(all) resource Plan {
        access(all) let id: UInt64
        access(all) let sourceTokenType: Type
        access(all) let targetTokenType: Type
        access(all) let amountPerInterval: UFix64
        access(all) let intervalSeconds: UInt64
        access(all) let maxSlippageBps: UInt64
        access(all) let maxExecutions: UInt64?

        access(all) var status: PlanStatus
        access(all) var nextExecutionTime: UFix64?
        access(all) var executionCount: UInt64
        access(all) var totalSourceInvested: UFix64
        access(all) var totalTargetAcquired: UFix64
        access(all) var avgExecutionPriceFP128: UInt128
        access(all) let createdAt: UFix64
        access(all) var lastExecutedAt: UFix64?

        init(
            sourceTokenType: Type,
            targetTokenType: Type,
            amountPerInterval: UFix64,
            intervalSeconds: UInt64,
            maxSlippageBps: UInt64,
            maxExecutions: UInt64?,
            firstExecutionTime: UFix64
        ) {
            pre {
                amountPerInterval > 0.0: "Amount per interval must be positive"
                intervalSeconds > 0: "Interval must be positive"
                DeFiMath.isValidSlippage(slippageBps: maxSlippageBps): "Invalid slippage value"
                firstExecutionTime > getCurrentBlock().timestamp: "First execution must be in the future"
            }

            self.id = DCAPlanUnified.nextPlanId
            DCAPlanUnified.nextPlanId = DCAPlanUnified.nextPlanId + 1

            self.sourceTokenType = sourceTokenType
            self.targetTokenType = targetTokenType
            self.amountPerInterval = amountPerInterval
            self.intervalSeconds = intervalSeconds
            self.maxSlippageBps = maxSlippageBps
            self.maxExecutions = maxExecutions

            self.status = PlanStatus.Active
            self.nextExecutionTime = firstExecutionTime
            self.executionCount = 0
            self.totalSourceInvested = 0.0
            self.totalTargetAcquired = 0.0
            self.avgExecutionPriceFP128 = 0

            self.createdAt = getCurrentBlock().timestamp
            self.lastExecutedAt = nil
        }

        /// Check if this plan requires EVM execution
        access(all) view fun requiresEVM(): Bool {
            return DCAPlanUnified.isEVMToken(tokenType: self.sourceTokenType) ||
                   DCAPlanUnified.isEVMToken(tokenType: self.targetTokenType)
        }

        access(all) view fun isReadyForExecution(): Bool {
            if self.status != PlanStatus.Active {
                return false
            }
            if let nextTime = self.nextExecutionTime {
                return getCurrentBlock().timestamp >= nextTime
            }
            return false
        }

        access(all) view fun hasReachedMaxExecutions(): Bool {
            if let max = self.maxExecutions {
                return self.executionCount >= max
            }
            return false
        }

        access(all) fun recordExecution(amountIn: UFix64, amountOut: UFix64) {
            pre {
                self.status == PlanStatus.Active: "Plan must be active"
                amountIn > 0.0: "Amount in must be positive"
                amountOut > 0.0: "Amount out must be positive"
            }

            let executionPrice = DeFiMath.calculatePriceFP128(
                amountIn: amountIn,
                amountOut: amountOut
            )

            let newAvgPrice = DeFiMath.updateWeightedAveragePriceFP128(
                previousAvgPriceFP128: self.avgExecutionPriceFP128,
                totalPreviousIn: self.totalSourceInvested,
                newAmountIn: amountIn,
                newAmountOut: amountOut
            )

            self.totalSourceInvested = self.totalSourceInvested + amountIn
            self.totalTargetAcquired = self.totalTargetAcquired + amountOut
            self.avgExecutionPriceFP128 = newAvgPrice
            self.executionCount = self.executionCount + 1
            self.lastExecutedAt = getCurrentBlock().timestamp

            emit PlanExecuted(
                planId: self.id,
                executionCount: self.executionCount,
                amountIn: amountIn,
                amountOut: amountOut,
                executionPriceFP128: executionPrice,
                newAvgPriceFP128: newAvgPrice,
                timestamp: getCurrentBlock().timestamp
            )

            if self.hasReachedMaxExecutions() {
                self.status = PlanStatus.Completed
                self.nextExecutionTime = nil
                emit PlanUpdated(planId: self.id, active: false, nextExecutionTime: nil)
            }
        }

        access(all) fun scheduleNextExecution() {
            pre {
                self.status == PlanStatus.Active: "Plan must be active to schedule"
                !self.hasReachedMaxExecutions(): "Plan has reached max executions"
            }

            let currentTime = getCurrentBlock().timestamp
            let nextTime = currentTime + UFix64(self.intervalSeconds)
            self.nextExecutionTime = nextTime

            emit PlanUpdated(
                planId: self.id,
                active: true,
                nextExecutionTime: nextTime
            )
        }

        access(all) fun pause() {
            pre {
                self.status == PlanStatus.Active: "Plan must be active to pause"
            }
            self.status = PlanStatus.Paused
            self.nextExecutionTime = nil
            emit PlanPaused(planId: self.id, timestamp: getCurrentBlock().timestamp)
        }

        access(all) fun resume(nextExecutionTime: UFix64?) {
            pre {
                self.status == PlanStatus.Paused: "Plan must be paused to resume"
                !self.hasReachedMaxExecutions(): "Cannot resume completed plan"
            }
            self.status = PlanStatus.Active
            let nextTime = nextExecutionTime ?? (getCurrentBlock().timestamp + UFix64(self.intervalSeconds))
            self.nextExecutionTime = nextTime
            emit PlanResumed(planId: self.id, nextExecutionTime: nextTime)
        }

        access(all) fun getDetails(): PlanDetails {
            return PlanDetails(
                id: self.id,
                sourceTokenType: self.sourceTokenType.identifier,
                targetTokenType: self.targetTokenType.identifier,
                amountPerInterval: self.amountPerInterval,
                intervalSeconds: self.intervalSeconds,
                maxSlippageBps: self.maxSlippageBps,
                maxExecutions: self.maxExecutions,
                status: self.status.rawValue,
                nextExecutionTime: self.nextExecutionTime,
                executionCount: self.executionCount,
                totalSourceInvested: self.totalSourceInvested,
                totalTargetAcquired: self.totalTargetAcquired,
                avgExecutionPriceFP128: self.avgExecutionPriceFP128,
                avgExecutionPriceDisplay: DeFiMath.fp128ToUFix64(priceFP128: self.avgExecutionPriceFP128),
                createdAt: self.createdAt,
                lastExecutedAt: self.lastExecutedAt,
                requiresEVM: self.requiresEVM()
            )
        }
    }

    access(all) struct PlanDetails {
        access(all) let id: UInt64
        access(all) let sourceTokenType: String
        access(all) let targetTokenType: String
        access(all) let amountPerInterval: UFix64
        access(all) let intervalSeconds: UInt64
        access(all) let maxSlippageBps: UInt64
        access(all) let maxExecutions: UInt64?
        access(all) let status: UInt8
        access(all) let nextExecutionTime: UFix64?
        access(all) let executionCount: UInt64
        access(all) let totalSourceInvested: UFix64
        access(all) let totalTargetAcquired: UFix64
        access(all) let avgExecutionPriceFP128: UInt128
        access(all) let avgExecutionPriceDisplay: UFix64
        access(all) let createdAt: UFix64
        access(all) let lastExecutedAt: UFix64?
        access(all) let requiresEVM: Bool

        init(
            id: UInt64,
            sourceTokenType: String,
            targetTokenType: String,
            amountPerInterval: UFix64,
            intervalSeconds: UInt64,
            maxSlippageBps: UInt64,
            maxExecutions: UInt64?,
            status: UInt8,
            nextExecutionTime: UFix64?,
            executionCount: UInt64,
            totalSourceInvested: UFix64,
            totalTargetAcquired: UFix64,
            avgExecutionPriceFP128: UInt128,
            avgExecutionPriceDisplay: UFix64,
            createdAt: UFix64,
            lastExecutedAt: UFix64?,
            requiresEVM: Bool
        ) {
            self.id = id
            self.sourceTokenType = sourceTokenType
            self.targetTokenType = targetTokenType
            self.amountPerInterval = amountPerInterval
            self.intervalSeconds = intervalSeconds
            self.maxSlippageBps = maxSlippageBps
            self.maxExecutions = maxExecutions
            self.status = status
            self.nextExecutionTime = nextExecutionTime
            self.executionCount = executionCount
            self.totalSourceInvested = totalSourceInvested
            self.totalTargetAcquired = totalTargetAcquired
            self.avgExecutionPriceFP128 = avgExecutionPriceFP128
            self.avgExecutionPriceDisplay = avgExecutionPriceDisplay
            self.createdAt = createdAt
            self.lastExecutedAt = lastExecutedAt
            self.requiresEVM = requiresEVM
        }
    }

    access(all) fun createPlan(
        sourceTokenType: Type,
        targetTokenType: Type,
        amountPerInterval: UFix64,
        intervalSeconds: UInt64,
        maxSlippageBps: UInt64,
        maxExecutions: UInt64?,
        firstExecutionTime: UFix64
    ): @Plan {
        return <- create Plan(
            sourceTokenType: sourceTokenType,
            targetTokenType: targetTokenType,
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds,
            maxSlippageBps: maxSlippageBps,
            maxExecutions: maxExecutions,
            firstExecutionTime: firstExecutionTime
        )
    }

    init() {
        self.nextPlanId = 1
        self.PlanStoragePath = /storage/DCAPlanUnified
        self.PlanPublicPath = /public/DCAPlanUnified
    }
}
