/**
 * Cadence Transaction Templates
 *
 * All Cadence transaction and script code for the DCA application.
 * Uses template literals with 0x prefixes that FCL will replace with actual addresses.
 */

/**
 * Setup DCA Controller
 * Must be run once before creating any plans
 */
export const SETUP_CONTROLLER_TX = `
import DCAController from 0xDCAController
import FlowToken from 0xFlowToken
import FungibleToken from 0xFungibleToken
import TeleportedTetherToken from 0xcfdd90d4a00f7b5b

transaction {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Check if controller already exists
        if signer.storage.borrow<&DCAController.Controller>(
            from: DCAController.ControllerStoragePath
        ) != nil {
            log("DCA Controller already exists")
            return
        }

        // Initialize USDT vault if it doesn't exist
        if signer.storage.borrow<&TeleportedTetherToken.Vault>(
            from: /storage/teleportedTetherTokenVault
        ) == nil {
            // Create empty USDT vault
            let usdtVault <- TeleportedTetherToken.createEmptyVault(vaultType: Type<@TeleportedTetherToken.Vault>())

            // Save vault to storage
            signer.storage.save(<-usdtVault, to: /storage/teleportedTetherTokenVault)

            // Create public receiver capability
            let receiverCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(
                /storage/teleportedTetherTokenVault
            )
            signer.capabilities.publish(receiverCap, at: /public/teleportedTetherTokenReceiver)

            // Create public balance capability
            let balanceCap = signer.capabilities.storage.issue<&TeleportedTetherToken.Vault>(
                /storage/teleportedTetherTokenVault
            )
            signer.capabilities.publish(balanceCap, at: /public/teleportedTetherTokenBalance)

            log("USDT vault initialized")
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

        // Configure source vault capability (USDT)
        let sourceVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            /storage/teleportedTetherTokenVault
        )
        controllerRef.setSourceVaultCapability(cap: sourceVaultCap)

        // Configure target vault capability (FLOW)
        let targetVaultCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(
            /storage/flowTokenVault
        )
        controllerRef.setTargetVaultCapability(cap: targetVaultCap)

        log("DCA Controller setup complete for USDT → FLOW")
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
import TeleportedTetherToken from 0xcfdd90d4a00f7b5b

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

        // Create plan for USDT → FLOW swap
        let plan <- DCAPlan.createPlan(
            sourceTokenType: Type<@TeleportedTetherToken.Vault>(),
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

        log("Created USDT → FLOW DCA Plan #".concat(planId.toString()))
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
