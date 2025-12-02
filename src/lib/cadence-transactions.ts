/**
 * Cadence Transaction Templates
 *
 * All Cadence transaction and script code for the DCA application.
 * Uses template literals with 0x prefixes that FCL will replace with actual addresses.
 */

/**
 * Setup DCA Controller
 * Must be run once before creating any plans
 *
 * IMPORTANT: If controller already exists, this will update it with the fee vault capability
 */
export const SETUP_CONTROLLER_TX = `
import DCAController from 0xDCAController
import FlowToken from 0xFlowToken
import FungibleToken from 0xFungibleToken
import USDCFlow from 0xf1ab99c82dee3526

transaction {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Check if controller already exists - if so, update it with fee vault capability
        if signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) != nil {
            log("DCA Controller already exists, updating with fee vault capability...")

            let controllerRef = signer.storage.borrow<&DCAController.Controller>(
                from: DCAController.ControllerStoragePath
            )!

            // Configure fee vault capability (FLOW) for scheduler fees
            let feeVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
                /storage/flowTokenVault
            )
            controllerRef.setFeeVaultCapability(cap: feeVaultCap)

            log("Controller updated successfully")
            return
        }

        // Initialize USDC vault if it doesn't exist
        if signer.storage.borrow<&USDCFlow.Vault>(
            from: /storage/usdcFlowVault
        ) == nil {
            // Create empty USDC vault
            let usdcVault <- USDCFlow.createEmptyVault(vaultType: Type<@USDCFlow.Vault>())

            // Save vault to storage
            signer.storage.save(<-usdcVault, to: /storage/usdcFlowVault)

            // Create public receiver capability
            let receiverCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(
                /storage/usdcFlowVault
            )
            signer.capabilities.publish(receiverCap, at: /public/usdcFlowReceiver)

            // Create public balance capability
            let balanceCap = signer.capabilities.storage.issue<&USDCFlow.Vault>(
                /storage/usdcFlowVault
            )
            signer.capabilities.publish(balanceCap, at: /public/usdcFlowBalance)

            log("USDC vault initialized")
        }

        // Create controller
        let controller <- DCAController.createController()

        // Store controller
        signer.storage.save(<-controller, to: DCAController.ControllerStoragePath)

        // Create public capability
        let cap = signer.capabilities.storage.issue<&DCAController.Controller>(
            DCAController.ControllerStoragePath
        )
        signer.capabilities.publish(cap, at: DCAController.ControllerPublicPath)

        // Borrow controller reference
        let controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        )!

        // Configure source vault capability (USDC)
        let sourceVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            /storage/usdcFlowVault
        )
        controllerRef.setSourceVaultCapability(cap: sourceVaultCap)

        // Configure target vault capability (FLOW)
        let targetVaultCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(
            /storage/flowTokenVault
        )
        controllerRef.setTargetVaultCapability(cap: targetVaultCap)

        // Configure fee vault capability (FLOW) for scheduler fees
        let feeVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            /storage/flowTokenVault
        )
        controllerRef.setFeeVaultCapability(cap: feeVaultCap)

        log("DCA Controller setup complete for USDC → FLOW with scheduler fees")
    }
}
`;

/**
 * Create DCA Plan
 *
 * @param amountPerInterval - Amount of FLOW per interval (UFix64)
 * @param intervalSeconds - Seconds between executions (UInt64)
 * @param maxSlippageBps - Max slippage in basis points (UInt64, e.g. 100 = 1%)
 * @param maxExecutions - Optional max executions (UInt64? or nil)
 * @param firstExecutionDelay - Seconds until first execution (UInt64)
 */
export const CREATE_PLAN_TX = `
import DCAPlan from 0xDCAPlan
import DCAController from 0xDCAController
import DeFiMath from 0xDeFiMath
import FlowToken from 0xFlowToken
import USDCFlow from 0xf1ab99c82dee3526

transaction(
    amountPerInterval: UFix64,
    intervalSeconds: UInt64,
    maxSlippageBps: UInt64,
    maxExecutions: UInt64?,
    firstExecutionDelay: UInt64
) {
    let controllerRef: &DCAController.Controller

    prepare(signer: auth(Storage) &Account) {
        // Borrow controller
        self.controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) ?? panic("DCA Controller not found. Run setup first")

        // Validate controller is fully configured
        assert(
            self.controllerRef.isFullyConfigured(),
            message: "Controller not fully configured"
        )
    }

    execute {
        // Validate inputs
        assert(amountPerInterval > 0.0, message: "Amount must be positive")
        assert(intervalSeconds > 0, message: "Interval must be positive")
        assert(DeFiMath.isValidSlippage(slippageBps: maxSlippageBps), message: "Invalid slippage")
        assert(firstExecutionDelay > 0, message: "Delay must be positive")

        // Calculate first execution time
        let firstExecutionTime = getCurrentBlock().timestamp + UFix64(firstExecutionDelay)

        // Create plan for USDC → FLOW swap
        let plan <- DCAPlan.createPlan(
            sourceTokenType: Type<@USDCFlow.Vault>(),
            targetTokenType: Type<@FlowToken.Vault>(),
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds,
            maxSlippageBps: maxSlippageBps,
            maxExecutions: maxExecutions,
            firstExecutionTime: firstExecutionTime
        )

        let planId = plan.id

        // Add to controller
        self.controllerRef.addPlan(plan: <-plan)

        log("Created USDC → FLOW DCA Plan #".concat(planId.toString()))
    }
}
`;

/**
 * Get all plans for an address
 *
 * @param address - Account address to query
 * @returns Array of plan details
 */
export const GET_ALL_PLANS_SCRIPT = `
import DCAController from 0xDCAController
import DCAPlan from 0xDCAPlan

access(all) fun main(address: Address): [DCAPlan.PlanDetails] {
    let account = getAccount(address)

    let controllerRef = account.capabilities
        .get<&DCAController.Controller>(DCAController.ControllerPublicPath)
        .borrow()

    if controllerRef == nil {
        return []
    }

    return controllerRef!.getAllPlans()
}
`;

/**
 * Check if controller is configured
 *
 * @param address - Account address to check
 * @returns True if controller exists and is configured
 */
export const CHECK_CONTROLLER_SCRIPT = `
import DCAController from 0xDCAController

access(all) fun main(address: Address): Bool {
    let account = getAccount(address)

    let controllerRef = account.capabilities
        .get<&DCAController.Controller>(DCAController.ControllerPublicPath)
        .borrow()

    if controllerRef == nil {
        return false
    }

    return controllerRef!.isFullyConfigured()
}
`;

/**
 * Get plan details by ID
 *
 * @param address - Account address
 * @param planId - Plan ID
 * @returns Plan details or nil
 */
export const GET_PLAN_DETAILS_SCRIPT = `
import DCAController from 0xDCAController
import DCAPlan from 0xDCAPlan

access(all) fun main(address: Address, planId: UInt64): DCAPlan.PlanDetails? {
    let account = getAccount(address)

    let controllerRef = account.capabilities
        .get<&DCAController.Controller>(DCAController.ControllerPublicPath)
        .borrow()

    if controllerRef == nil {
        return nil
    }

    return controllerRef!.getPlan(planId: planId)
}
`;

/**
 * Get all tokens that can be swapped with FLOW on IncrementFi
 *
 * @returns Array of token information including symbol, address, and liquidity
 */
export const GET_FLOW_SWAPPABLE_TOKENS_SCRIPT = `
import SwapFactory from 0xSwapFactory
import SwapInterfaces from 0xSwapInterfaces

access(all) struct TokenInfo {
    access(all) let symbol: String
    access(all) let tokenAddress: String
    access(all) let tokenContract: String
    access(all) let tokenIdentifier: String
    access(all) let pairAddress: Address
    access(all) let flowReserve: String
    access(all) let tokenReserve: String
    access(all) let isStable: Bool

    init(
        symbol: String,
        tokenAddress: String,
        tokenContract: String,
        tokenIdentifier: String,
        pairAddress: Address,
        flowReserve: String,
        tokenReserve: String,
        isStable: Bool
    ) {
        self.symbol = symbol
        self.tokenAddress = tokenAddress
        self.tokenContract = tokenContract
        self.tokenIdentifier = tokenIdentifier
        self.pairAddress = pairAddress
        self.flowReserve = flowReserve
        self.tokenReserve = tokenReserve
        self.isStable = isStable
    }
}

access(all) fun main(): [TokenInfo] {
    let flowTokenIdentifier = "A.1654653399040a61.FlowToken"
    let tokenInfos: [TokenInfo] = []

    let pairsCount = SwapFactory.getAllPairsLength()
    if pairsCount == 0 {
        return []
    }

    let limit: UInt64 = pairsCount > 50 ? 50 : UInt64(pairsCount)
    let allPairInfos = SwapFactory.getSlicedPairInfos(from: 0, to: limit - 1)

    for pairInfoRaw in allPairInfos {
        let pairInfo = pairInfoRaw as! [AnyStruct]
        let token0 = (pairInfo[0] as! String)
        let token1 = (pairInfo[1] as! String)
        let token0Reserve = (pairInfo[2] as! UFix64)
        let token1Reserve = (pairInfo[3] as! UFix64)
        let pairAddr = (pairInfo[4] as! Address)
        let isStableSwap = (pairInfo[7] as! Bool)

        var targetToken: String? = nil
        var isToken0Flow = false

        if token0.slice(from: 0, upTo: token0.length).contains(flowTokenIdentifier) {
            targetToken = token1
            isToken0Flow = true
        } else if token1.slice(from: 0, upTo: token1.length).contains(flowTokenIdentifier) {
            targetToken = token0
            isToken0Flow = false
        }

        if targetToken != nil {
            let parts = splitString(targetToken!, separator: ".")
            let tokenAddress = parts.length > 1 ? parts[1] : ""
            let tokenContract = parts.length > 2 ? parts[2] : ""
            let symbol = getTokenSymbol(tokenContract)

            let flowReserve = isToken0Flow ? token0Reserve.toString() : token1Reserve.toString()
            let tokenReserve = isToken0Flow ? token1Reserve.toString() : token0Reserve.toString()

            tokenInfos.append(TokenInfo(
                symbol: symbol,
                tokenAddress: tokenAddress,
                tokenContract: tokenContract,
                tokenIdentifier: targetToken!,
                pairAddress: pairAddr,
                flowReserve: flowReserve,
                tokenReserve: tokenReserve,
                isStable: isStableSwap
            ))
        }
    }

    return tokenInfos
}

access(all) fun splitString(_ str: String, separator: String): [String] {
    let parts: [String] = []
    var current = ""
    var i = 0

    while i < str.length {
        let char = str.slice(from: i, upTo: i + 1)
        if char == separator {
            if current.length > 0 {
                parts.append(current)
            }
            current = ""
        } else {
            current = current.concat(char)
        }
        i = i + 1
    }

    if current.length > 0 {
        parts.append(current)
    }

    return parts
}

access(all) fun getTokenSymbol(_ contractName: String): String {
    switch contractName {
        case "FlowToken":
            return "FLOW"
        case "FiatToken":
            return "USDC"
        case "TeleportedTetherToken":
            return "USDT"
        case "stFlowToken":
            return "stFLOW"
        case "BeaverToken":
            return "BEAVER"
        case "DucToken":
            return "DUC"
        case "CowToken":
            return "COW"
        default:
            // Return first 4 characters of contract name
            let maxLen = 4 < contractName.length ? 4 : contractName.length
            return contractName.slice(from: 0, upTo: maxLen)
    }
}
`;

/**
 * Pause DCA Plan
 *
 * @param planId - ID of the plan to pause
 */
export const PAUSE_PLAN_TX = `
import DCAController from 0xDCAController

transaction(planId: UInt64) {
    let controllerRef: &DCAController.Controller

    prepare(signer: auth(Storage) &Account) {
        self.controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) ?? panic("DCA Controller not found")
    }

    execute {
        let planRef = self.controllerRef.borrowPlan(id: planId)
            ?? panic("Plan not found with ID: ".concat(planId.toString()))

        planRef.pause()

        log("Plan ".concat(planId.toString()).concat(" has been paused"))
    }
}
`;

/**
 * Resume DCA Plan
 *
 * @param planId - ID of the plan to resume
 * @param delaySeconds - Optional seconds until next execution (nil = use interval from now)
 */
export const RESUME_PLAN_TX = `
import DCAController from 0xDCAController

transaction(planId: UInt64, delaySeconds: UInt64?) {
    let controllerRef: &DCAController.Controller

    prepare(signer: auth(Storage) &Account) {
        self.controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) ?? panic("DCA Controller not found")
    }

    execute {
        let planRef = self.controllerRef.borrowPlan(id: planId)
            ?? panic("Plan not found with ID: ".concat(planId.toString()))

        let nextExecutionTime = delaySeconds != nil
            ? getCurrentBlock().timestamp + UFix64(delaySeconds!)
            : nil

        planRef.resume(nextExecutionTime: nextExecutionTime)

        log("Plan ".concat(planId.toString()).concat(" has been resumed"))
        if nextExecutionTime != nil {
            log("Next execution at: ".concat(nextExecutionTime!.toString()))
        }
    }
}
`;

/**
 * Get token balance for an address
 *
 * @param address - Account address
 * @param tokenType - "FLOW" or "USDT"
 * @returns Balance as UFix64
 */
export const GET_TOKEN_BALANCE_SCRIPT = `
import FungibleToken from 0xFungibleToken
import FlowToken from 0xFlowToken
import TeleportedTetherToken from 0xcfdd90d4a00f7b5b

access(all) fun main(address: Address, tokenType: String): UFix64 {
    let account = getAccount(address)

    if tokenType == "FLOW" {
        let vaultRef = account.capabilities
            .get<&FlowToken.Vault>(/public/flowTokenBalance)
            .borrow()

        if vaultRef == nil {
            return 0.0
        }

        return vaultRef!.balance
    } else if tokenType == "USDT" {
        let vaultRef = account.capabilities
            .get<&TeleportedTetherToken.Vault>(/public/teleportedTetherTokenBalance)
            .borrow()

        if vaultRef == nil {
            return 0.0
        }

        return vaultRef!.balance
    }

    return 0.0
}
`;

/**
 * Initialize DCA Handler
 * Must be run once before scheduling any plans
 *
 * Note: V2 handlers use Manager pattern and don't require setHandlerCapability
 */
export const INIT_DCA_HANDLER_TX = `
import DCATransactionHandler from 0xDCATransactionHandler
import DCAController from 0xDCAController
import FlowTransactionScheduler from 0xFlowTransactionScheduler

transaction() {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Check if handler already exists
        if signer.storage.borrow<&DCATransactionHandler.Handler>(from: /storage/DCATransactionHandler) != nil {
            log("DCA Handler already exists")
            return
        }

        // Get controller capability with Owner entitlement
        let controllerCap = signer.capabilities.storage
            .issue<auth(DCAController.Owner) &DCAController.Controller>(
                DCAController.ControllerStoragePath
            )

        // Verify controller exists and capability is valid
        assert(controllerCap.check(), message: "Invalid controller capability. Run setup first.")

        // Create handler resource
        let handler <- DCATransactionHandler.createHandler(controllerCap: controllerCap)

        // Save handler to storage
        signer.storage.save(<-handler, to: /storage/DCATransactionHandler)

        // Create entitled capability for FlowTransactionScheduler
        let handlerCapEntitled = signer.capabilities.storage
            .issue<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>(
                /storage/DCATransactionHandler
            )

        // Publish public capability for discoverability
        let handlerCapPublic = signer.capabilities.storage
            .issue<&{FlowTransactionScheduler.TransactionHandler}>(
                /storage/DCATransactionHandler
            )

        signer.capabilities.publish(handlerCapPublic, at: /public/DCATransactionHandler)

        log("DCA Handler initialization complete")
    }
}
`;

/**
 * Schedule DCA Plan Execution (V1 - Emulator/Testnet)
 *
 * @param planId - ID of the plan to schedule
 * @param delaySeconds - Seconds until execution
 * @param priority - 0 = High, 1 = Medium, 2 = Low
 * @param executionEffort - Gas/computation limit (e.g., 9999)
 *
 * Note: V1 uses simple {String: UInt64} transaction data format
 */
export const SCHEDULE_DCA_PLAN_TX_V1 = `
import FlowTransactionScheduler from 0xFlowTransactionScheduler
import FlowTransactionSchedulerUtils from 0xFlowTransactionSchedulerUtils
import FlowToken from 0xFlowToken
import FungibleToken from 0xFungibleToken

transaction(
    planId: UInt64,
    delaySeconds: UFix64,
    priority: UInt8,
    executionEffort: UInt64
) {
    prepare(signer: auth(BorrowValue, IssueStorageCapabilityController, SaveValue, GetStorageCapabilityController, PublishCapability) &Account) {
        // Calculate future execution time
        let future = getCurrentBlock().timestamp + delaySeconds

        // Convert priority to enum
        let pr = priority == 0
            ? FlowTransactionScheduler.Priority.High
            : priority == 1
                ? FlowTransactionScheduler.Priority.Medium
                : FlowTransactionScheduler.Priority.Low

        // Get the entitled capability for the handler
        var handlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>? = nil

        let controllers = signer.capabilities.storage.getControllers(forPath: /storage/DCATransactionHandler)
        assert(controllers.length > 0, message: "No handler found. Run init first")

        // Find the correct capability (with Execute entitlement)
        for controller in controllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}> {
                handlerCap = cap
                break
            }
        }

        assert(handlerCap != nil, message: "Could not find Execute-entitled handler capability")

        // Create or borrow manager
        if signer.storage.borrow<&AnyResource>(from: FlowTransactionSchedulerUtils.managerStoragePath) == nil {
            let manager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-manager, to: FlowTransactionSchedulerUtils.managerStoragePath)

            // Create public capability for the manager
            let managerCapPublic = signer.capabilities.storage.issue<&{FlowTransactionSchedulerUtils.Manager}>(
                FlowTransactionSchedulerUtils.managerStoragePath
            )
            signer.capabilities.publish(managerCapPublic, at: FlowTransactionSchedulerUtils.managerPublicPath)
        }

        // Borrow the manager
        let manager = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("Could not borrow manager")

        // Prepare transaction data (planId will be passed to handler)
        let transactionData: {String: UInt64} = {"planId": planId}

        // Estimate fees
        let est = FlowTransactionScheduler.estimate(
            data: transactionData,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort
        )

        // Verify estimation succeeded
        assert(
            est.timestamp != nil || pr == FlowTransactionScheduler.Priority.Low,
            message: est.error ?? "Estimation failed"
        )

        // Withdraw fees
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Missing FlowToken vault")

        let feeAmount = est.flowFee ?? 0.0
        assert(vaultRef.balance >= feeAmount, message: "Insufficient FLOW balance for scheduler fees")

        let fees <- vaultRef.withdraw(amount: feeAmount) as! @FlowToken.Vault

        // Schedule through the manager
        let transactionId = manager.schedule(
            handlerCap: handlerCap!,
            data: transactionData,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort,
            fees: <-fees
        )

        log("Scheduled transaction ID: ".concat(transactionId.toString()))
    }
}
`;

/**
 * Schedule DCA Plan Execution (V2 - Mainnet)
 *
 * @param planId - ID of the plan to schedule
 * @param delaySeconds - Seconds until execution
 * @param priority - 0 = High, 1 = Medium, 2 = Low
 * @param executionEffort - Gas/computation limit (e.g., 9999)
 *
 * Note: V2 uses Manager pattern with ScheduleConfig and DCATransactionData
 */
export const SCHEDULE_DCA_PLAN_TX_V2 = `
import FlowTransactionScheduler from 0xFlowTransactionScheduler
import FlowTransactionSchedulerUtils from 0xFlowTransactionSchedulerUtils
import DCATransactionHandlerV2 from 0xDCATransactionHandler
import FlowToken from 0xFlowToken
import FungibleToken from 0xFungibleToken

transaction(
    planId: UInt64,
    delaySeconds: UFix64,
    priority: UInt8,
    executionEffort: UInt64
) {
    prepare(signer: auth(BorrowValue, IssueStorageCapabilityController, SaveValue, GetStorageCapabilityController, PublishCapability) &Account) {
        // Calculate future execution time
        let future = getCurrentBlock().timestamp + delaySeconds

        // Convert priority to enum
        let pr = priority == 0
            ? FlowTransactionScheduler.Priority.High
            : priority == 1
                ? FlowTransactionScheduler.Priority.Medium
                : FlowTransactionScheduler.Priority.Low

        // Get the entitled capability for the handler
        var handlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>? = nil

        let controllers = signer.capabilities.storage.getControllers(forPath: /storage/DCATransactionHandler)
        assert(controllers.length > 0, message: "No handler found. Run init first")

        // Find the correct capability (with Execute entitlement)
        for controller in controllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}> {
                handlerCap = cap
                break
            }
        }

        assert(handlerCap != nil, message: "Could not find Execute-entitled handler capability")

        // Create or borrow manager
        if signer.storage.borrow<&AnyResource>(from: FlowTransactionSchedulerUtils.managerStoragePath) == nil {
            let manager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-manager, to: FlowTransactionSchedulerUtils.managerStoragePath)

            // Create public capability for the manager
            let managerCapPublic = signer.capabilities.storage.issue<&{FlowTransactionSchedulerUtils.Manager}>(
                FlowTransactionSchedulerUtils.managerStoragePath
            )
            signer.capabilities.publish(managerCapPublic, at: FlowTransactionSchedulerUtils.managerPublicPath)
        }

        // Borrow the manager with Owner entitlement
        let manager = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("Could not borrow manager")

        // Create Manager capability for autonomous rescheduling
        let managerCap = signer.capabilities.storage.issue<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            FlowTransactionSchedulerUtils.managerStoragePath
        )

        // Create ScheduleConfig struct inline (for autonomous rescheduling)
        let scheduleConfig = DCATransactionHandlerV2.ScheduleConfig(
            schedulerManagerCap: managerCap,
            priority: pr,
            executionEffort: executionEffort
        )

        // Prepare transaction data with plan ID and schedule config
        let transactionData = DCATransactionHandlerV2.DCATransactionData(
            planId: planId,
            scheduleConfig: scheduleConfig
        )

        // Estimate fees
        let est = FlowTransactionScheduler.estimate(
            data: transactionData,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort
        )

        // Verify estimation succeeded
        assert(
            est.timestamp != nil || pr == FlowTransactionScheduler.Priority.Low,
            message: est.error ?? "Estimation failed"
        )

        // Withdraw fees
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Missing FlowToken vault")

        let feeAmount = est.flowFee ?? 0.0
        assert(vaultRef.balance >= feeAmount, message: "Insufficient FLOW balance for scheduler fees")

        let fees <- vaultRef.withdraw(amount: feeAmount) as! @FlowToken.Vault

        // Schedule through the manager
        let transactionId = manager.schedule(
            handlerCap: handlerCap!,
            data: transactionData,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort,
            fees: <-fees
        )

        log("Scheduled transaction ID: ".concat(transactionId.toString()))
        log("Plan will autonomously reschedule itself after each execution")
    }
}
`;

/**
 * Network-aware export for SCHEDULE_DCA_PLAN_TX
 * Automatically selects V1 (emulator/testnet) or V2 (mainnet) based on NEXT_PUBLIC_FLOW_NETWORK
 */
import { NETWORK } from "../config/fcl-config";
export const SCHEDULE_DCA_PLAN_TX = NETWORK === "mainnet" ? SCHEDULE_DCA_PLAN_TX_V2 : SCHEDULE_DCA_PLAN_TX_V1;

/**
 * Fund Fee Vault with FLOW for Scheduled Executions
 *
 * Estimates the fee for a single execution and deposits (numExecutions * fee) into the fee vault.
 * This ensures there's enough FLOW to pay for all scheduled transaction fees.
 *
 * @param planId - The plan ID to schedule
 * @param numExecutions - Number of planned executions (e.g., 10 for a plan with maxExecutions=10)
 * @param delaySeconds - Seconds until first execution (for fee estimation)
 * @param priority - Priority level (0=High, 1=Medium, 2=Low)
 * @param executionEffort - Execution effort estimate
 */
export const FUND_FEE_VAULT_TX_V2 = `
import FlowTransactionScheduler from 0xFlowTransactionScheduler
import FlowTransactionSchedulerUtils from 0xFlowTransactionSchedulerUtils
import DCATransactionHandlerV2 from 0xDCATransactionHandler
import DCAControllerV2 from 0xDCAController
import FlowToken from 0xFlowToken
import FungibleToken from 0xFungibleToken

transaction(planId: UInt64, numExecutions: UInt64, delaySeconds: UFix64, priority: UInt8, executionEffort: UInt64) {
    let flowVault: auth(FungibleToken.Withdraw) &FlowToken.Vault
    let controllerRef: &DCAControllerV2.Controller

    prepare(signer: auth(Storage) &Account) {
        // Borrow FLOW vault
        self.flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FLOW vault")

        // Borrow DCA controller
        self.controllerRef = signer.storage.borrow<&DCAControllerV2.Controller>(
            from: DCAControllerV2.ControllerStoragePath
        ) ?? panic("Could not borrow DCA controller")
    }

    execute {
        // Get Manager capability from controller
        let managerCap = signer.capabilities.storage.issue<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            FlowTransactionSchedulerUtils.ManagerStoragePath
        )

        // Convert priority to enum
        let pr = priority == 0 ? FlowTransactionScheduler.Priority.High :
                 priority == 1 ? FlowTransactionScheduler.Priority.Medium :
                 FlowTransactionScheduler.Priority.Low

        // Create schedule config
        let scheduleConfig = DCATransactionHandlerV2.ScheduleConfig(
            schedulerManagerCap: managerCap,
            priority: pr,
            executionEffort: executionEffort
        )

        // Prepare transaction data for estimation
        let transactionData = DCATransactionHandlerV2.DCATransactionData(
            planId: planId,
            scheduleConfig: scheduleConfig
        )

        // Calculate first execution time
        let firstExecutionTime = getCurrentBlock().timestamp + delaySeconds

        // Estimate fee for ONE execution
        let estimate = FlowTransactionScheduler.estimate(
            data: transactionData,
            timestamp: firstExecutionTime,
            priority: pr,
            executionEffort: executionEffort
        )

        // Get single execution fee
        let singleFee = estimate.flowFee ?? 0.0

        // Calculate total fee needed for all executions
        // Add 10% buffer for potential fee variations
        let totalFeeNeeded = singleFee * UFix64(numExecutions) * 1.1

        // Check if user has enough FLOW
        assert(
            self.flowVault.balance >= totalFeeNeeded,
            message: "Insufficient FLOW balance. Need ".concat(totalFeeNeeded.toString()).concat(" FLOW for ").concat(numExecutions.toString()).concat(" executions, have ").concat(self.flowVault.balance.toString())
        )

        // Withdraw FLOW from user's vault
        let feeDeposit <- self.flowVault.withdraw(amount: totalFeeNeeded)

        // Get fee vault capability from controller
        let feeVaultCap = self.controllerRef.getFeeVaultCapability()
            ?? panic("Fee vault capability not configured")

        // Borrow fee vault and deposit
        let feeVault = feeVaultCap.borrow()
            ?? panic("Could not borrow fee vault")

        feeVault.deposit(from: <-feeDeposit)

        log("Deposited ".concat(totalFeeNeeded.toString()).concat(" FLOW into fee vault for ").concat(numExecutions.toString()).concat(" executions (").concat(singleFee.toString()).concat(" per execution + 10% buffer)"))
    }
}
`;

// V1 version (for emulator/testnet) - simpler without Manager pattern
export const FUND_FEE_VAULT_TX_V1 = `
import FlowTransactionScheduler from 0xFlowTransactionScheduler
import DCATransactionHandler from 0xDCATransactionHandler
import DCAController from 0xDCAController
import FlowToken from 0xFlowToken
import FungibleToken from 0xFungibleToken

transaction(planId: UInt64, numExecutions: UInt64, delaySeconds: UFix64, priority: UInt8, executionEffort: UInt64) {
    let flowVault: auth(FungibleToken.Withdraw) &FlowToken.Vault
    let controllerRef: &DCAController.Controller

    prepare(signer: auth(Storage) &Account) {
        // Borrow FLOW vault
        self.flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FLOW vault")

        // Borrow DCA controller
        self.controllerRef = signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) ?? panic("Could not borrow DCA controller")
    }

    execute {
        // Estimate a conservative fee amount
        // On emulator/testnet, fees are typically very low or zero
        // Use a small buffer amount
        let estimatedSingleFee = 0.01 // Conservative estimate
        let totalFeeNeeded = estimatedSingleFee * UFix64(numExecutions) * 1.1

        // Check if user has enough FLOW
        if self.flowVault.balance >= totalFeeNeeded {
            // Withdraw FLOW from user's vault
            let feeDeposit <- self.flowVault.withdraw(amount: totalFeeNeeded)

            // Get fee vault capability from controller
            let feeVaultCap = self.controllerRef.getFeeVaultCapability()
                ?? panic("Fee vault capability not configured")

            // Borrow fee vault and deposit
            let feeVault = feeVaultCap.borrow()
                ?? panic("Could not borrow fee vault")

            feeVault.deposit(from: <-feeDeposit)

            log("Deposited ".concat(totalFeeNeeded.toString()).concat(" FLOW into fee vault for ").concat(numExecutions.toString()).concat(" executions"))
        } else {
            log("Skipping fee deposit - insufficient FLOW balance or fees not required on this network")
        }
    }
}
`;

export const FUND_FEE_VAULT_TX = NETWORK === "mainnet" ? FUND_FEE_VAULT_TX_V2 : FUND_FEE_VAULT_TX_V1;
