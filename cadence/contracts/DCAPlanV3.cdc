import "DeFiMath"
import "FungibleToken"

/// DCAPlan: Resource representing a single Dollar-Cost Averaging investment plan
///
/// Each plan represents a recurring investment strategy:
/// - Source token (e.g., FLOW) → Target token (e.g., USDF)
/// - Executes at regular intervals using Scheduled Transactions
/// - Tracks performance metrics (total invested, acquired, average price)
/// - Uses EVM DEXes (FlowSwap V3, PunchSwap V2) for swaps via UniswapV3SwapperConnector
///
/// Educational Notes:
/// - Plans are resources owned by users, stored in DCAController
/// - Each execution is atomic: withdraw → swap → deposit
/// - Slippage protection prevents unfavorable trades
access(all) contract DCAPlanV3 {

    /// Event emitted when a new DCA plan is created
    access(all) event PlanCreated(
        planId: UInt64,
        owner: Address,
        sourceTokenType: String,
        targetTokenType: String,
        amountPerInterval: UFix64,
        intervalSeconds: UInt64,
        maxSlippageBps: UInt64
    )

    /// Event emitted when a plan is executed
    access(all) event PlanExecuted(
        planId: UInt64,
        executionCount: UInt64,
        amountIn: UFix64,
        amountOut: UFix64,
        executionPriceFP128: UInt128,
        newAvgPriceFP128: UInt128,
        timestamp: UFix64
    )

    /// Event emitted when a plan is updated
    access(all) event PlanUpdated(
        planId: UInt64,
        active: Bool,
        nextExecutionTime: UFix64?
    )

    /// Event emitted when a plan is paused
    access(all) event PlanPaused(planId: UInt64, timestamp: UFix64)

    /// Event emitted when a plan is resumed
    access(all) event PlanResumed(planId: UInt64, nextExecutionTime: UFix64)

    /// Storage and public paths
    access(all) let PlanStoragePath: StoragePath
    access(all) let PlanPublicPath: PublicPath

    /// Global plan ID counter
    access(all) var nextPlanId: UInt64

    /// Status enum for plan state
    access(all) enum PlanStatus: UInt8 {
        access(all) case Active
        access(all) case Paused
        access(all) case Completed
        access(all) case Cancelled
    }

    /// The core DCA Plan resource
    ///
    /// This resource encapsulates all state and logic for a single DCA plan.
    /// It is owned by the user and stored in their DCAController.
    access(all) resource Plan {
        /// Unique identifier for this plan
        access(all) let id: UInt64

        /// Source token type identifier (e.g., A.1654653399040a61.FlowToken.Vault)
        access(all) let sourceTokenType: Type

        /// Target token type identifier (e.g., A.1e4aa0b87d10b141.EVMVMBridgedToken_XXX.Vault)
        access(all) let targetTokenType: Type

        /// Amount of source token to invest per interval
        access(all) let amountPerInterval: UFix64

        /// Interval between executions in seconds
        access(all) let intervalSeconds: UInt64

        /// Maximum acceptable slippage in basis points (e.g., 100 = 1%)
        access(all) let maxSlippageBps: UInt64

        /// Optional maximum number of executions (nil = unlimited)
        access(all) let maxExecutions: UInt64?

        /// Current status of the plan
        access(all) var status: PlanStatus

        /// Timestamp of next scheduled execution
        access(all) var nextExecutionTime: UFix64?

        /// Number of times this plan has been executed
        access(all) var executionCount: UInt64

        /// Total amount of source token invested (sum of all executions)
        access(all) var totalSourceInvested: UFix64

        /// Total amount of target token acquired (sum of all executions)
        access(all) var totalTargetAcquired: UFix64

        /// Weighted average execution price in FP128 format
        /// Represents target tokens received per source token
        access(all) var avgExecutionPriceFP128: UInt128

        /// Timestamp when plan was created
        access(all) let createdAt: UFix64

        /// Timestamp when plan was last executed
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

            self.id = DCAPlanV3.nextPlanId
            DCAPlanV3.nextPlanId = DCAPlanV3.nextPlanId + 1

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

        /// Check if plan is ready for execution
        ///
        /// @return true if plan should execute now
        access(all) view fun isReadyForExecution(): Bool {
            if self.status != PlanStatus.Active {
                return false
            }

            if let nextTime = self.nextExecutionTime {
                return getCurrentBlock().timestamp >= nextTime
            }

            return false
        }

        /// Check if plan has reached max executions
        access(all) view fun hasReachedMaxExecutions(): Bool {
            if let max = self.maxExecutions {
                return self.executionCount >= max
            }
            return false
        }

        /// Record a successful execution
        ///
        /// Updates all accounting fields and calculates new average price.
        /// This should be called by the scheduled handler after swap execution.
        access(all) fun recordExecution(amountIn: UFix64, amountOut: UFix64) {
            pre {
                self.status == PlanStatus.Active: "Plan must be active"
                amountIn > 0.0: "Amount in must be positive"
                amountOut > 0.0: "Amount out must be positive"
            }

            // Calculate execution price
            let executionPrice = DeFiMath.calculatePriceFP128(
                amountIn: amountIn,
                amountOut: amountOut
            )

            // Update weighted average price
            let newAvgPrice = DeFiMath.updateWeightedAveragePriceFP128(
                previousAvgPriceFP128: self.avgExecutionPriceFP128,
                totalPreviousIn: self.totalSourceInvested,
                newAmountIn: amountIn,
                newAmountOut: amountOut
            )

            // Update accounting
            self.totalSourceInvested = self.totalSourceInvested + amountIn
            self.totalTargetAcquired = self.totalTargetAcquired + amountOut
            self.avgExecutionPriceFP128 = newAvgPrice
            self.executionCount = self.executionCount + 1
            self.lastExecutedAt = getCurrentBlock().timestamp

            // Emit execution event
            emit PlanExecuted(
                planId: self.id,
                executionCount: self.executionCount,
                amountIn: amountIn,
                amountOut: amountOut,
                executionPriceFP128: executionPrice,
                newAvgPriceFP128: newAvgPrice,
                timestamp: getCurrentBlock().timestamp
            )

            // Check if plan should complete
            if self.hasReachedMaxExecutions() {
                self.status = PlanStatus.Completed
                self.nextExecutionTime = nil
                emit PlanUpdated(planId: self.id, active: false, nextExecutionTime: nil)
            }
        }

        /// Schedule next execution
        ///
        /// Calculates and sets the next execution time based on interval.
        /// Should be called after recordExecution.
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

        /// Pause the plan
        ///
        /// Prevents further executions until resumed.
        access(all) fun pause() {
            pre {
                self.status == PlanStatus.Active: "Plan must be active to pause"
            }

            self.status = PlanStatus.Paused
            self.nextExecutionTime = nil

            emit PlanPaused(planId: self.id, timestamp: getCurrentBlock().timestamp)
        }

        /// Resume the plan
        ///
        /// Re-activates plan and schedules next execution.
        access(all) fun resume(nextExecutionTime: UFix64?) {
            pre {
                self.status == PlanStatus.Paused: "Plan must be paused to resume"
                !self.hasReachedMaxExecutions(): "Cannot resume completed plan"
            }

            self.status = PlanStatus.Active

            // If next execution time provided, use it; otherwise use interval from now
            let nextTime = nextExecutionTime ?? (getCurrentBlock().timestamp + UFix64(self.intervalSeconds))
            self.nextExecutionTime = nextTime

            emit PlanResumed(planId: self.id, nextExecutionTime: nextTime)
        }

        /// Get plan details as a struct for easy querying
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
                lastExecutedAt: self.lastExecutedAt
            )
        }
    }

    /// Public struct for plan details (used in scripts)
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
            lastExecutedAt: UFix64?
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
        }
    }

    /// Create a new DCA plan
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
        self.PlanStoragePath = /storage/DCAPlanV3
        self.PlanPublicPath = /public/DCAPlanV3
    }
}
