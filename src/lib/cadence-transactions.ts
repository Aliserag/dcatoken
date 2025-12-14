/**
 * Cadence Transaction Templates for EVM DCA System
 *
 * Uses DCAServiceEVM for pure EVM-native DCA.
 * Users interact via ERC-20 approve in their EVM wallet (Metamask).
 */

// =============================================================================
// SCRIPTS - Query DCA plans and state
// =============================================================================

/**
 * Get all DCA plans for an EVM user address
 */
export const GET_USER_PLANS_SCRIPT = `
import EVM from 0xEVM
import DCAServiceEVM from 0xDCAServiceEVM

access(all) fun main(userEVMAddressHex: String): [DCAServiceEVM.PlanData] {
    let userEVMAddress = EVM.addressFromString(userEVMAddressHex)
    return DCAServiceEVM.getUserPlans(userEVMAddress: userEVMAddress)
}
`;

/**
 * Get a specific DCA plan by ID
 */
export const GET_PLAN_SCRIPT = `
import DCAServiceEVM from 0xDCAServiceEVM

access(all) fun main(planId: UInt64): DCAServiceEVM.PlanData? {
    return DCAServiceEVM.getPlan(planId: planId)
}
`;

/**
 * Get total number of DCA plans
 */
export const GET_TOTAL_PLANS_SCRIPT = `
import DCAServiceEVM from 0xDCAServiceEVM

access(all) fun main(): Int {
    return DCAServiceEVM.getTotalPlans()
}
`;

/**
 * Get the shared COA address that users need to approve
 */
export const GET_COA_ADDRESS_SCRIPT = `
import DCAServiceEVM from 0xDCAServiceEVM

access(all) fun main(): String {
    return DCAServiceEVM.getCOAAddress().toString()
}
`;

/**
 * Check ERC-20 allowance for a user
 */
export const CHECK_ALLOWANCE_SCRIPT = `
import EVM from 0xEVM
import DCAServiceEVM from 0xDCAServiceEVM

access(all) fun main(userEVMAddressHex: String, tokenAddressHex: String): UInt256 {
    let userEVMAddress = EVM.addressFromString(userEVMAddressHex)
    let tokenAddress = EVM.addressFromString(tokenAddressHex)
    return DCAServiceEVM.checkAllowance(userEVMAddress: userEVMAddress, tokenAddress: tokenAddress)
}
`;


/**
 * Get FLOW balance (native Cadence)
 */
export const GET_FLOW_BALANCE_SCRIPT = `
import FlowToken from 0xFlowToken
import FungibleToken from 0xFungibleToken

access(all) fun main(address: Address): UFix64 {
    let account = getAccount(address)
    let vaultRef = account.capabilities.borrow<&{FungibleToken.Balance}>(/public/flowTokenBalance)
    return vaultRef?.balance ?? 0.0
}
`;

// =============================================================================
// CADENCE USER TRANSACTIONS - For Flow wallet users
// =============================================================================

/**
 * Setup COA (Cadence Owned Account) for Cadence users
 * Creates an EVM account that can hold ERC-20 tokens
 */
export const SETUP_COA_TX = `
import EVM from 0xEVM
import FungibleToken from 0xFungibleToken
import FlowToken from 0xFlowToken

transaction(initialFunding: UFix64?) {
    let coa: auth(EVM.Call) &EVM.CadenceOwnedAccount

    prepare(signer: auth(Storage, Capabilities, BorrowValue) &Account) {
        let coaPath = /storage/evm

        if signer.storage.type(at: coaPath) == nil {
            let newCOA <- EVM.createCadenceOwnedAccount()
            signer.storage.save(<-newCOA, to: coaPath)
            log("Created new COA")

            let cap = signer.capabilities.storage.issue<&EVM.CadenceOwnedAccount>(coaPath)
            signer.capabilities.publish(cap, at: /public/evm)
            log("Published COA capability")
        } else {
            log("COA already exists")
        }

        self.coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(from: coaPath)
            ?? panic("Could not borrow COA")

        if initialFunding != nil && initialFunding! > 0.0 {
            let flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
                from: /storage/flowTokenVault
            ) ?? panic("Could not borrow FlowToken vault")

            let funding <- flowVault.withdraw(amount: initialFunding!) as! @FlowToken.Vault
            self.coa.deposit(from: <-funding)
            log("Funded COA with ".concat(initialFunding!.toString()).concat(" FLOW"))
        }
    }

    execute {
        let evmAddress = self.coa.address()
        log("COA Setup Complete!")
        log("EVM Address: ".concat(evmAddress.toString()))
    }
}
`;

/**
 * Wrap FLOW to WFLOW for Cadence users
 */
export const WRAP_FLOW_TX = `
import EVM from 0xEVM
import FungibleToken from 0xFungibleToken
import FlowToken from 0xFlowToken

transaction(amount: UFix64) {
    let coa: auth(EVM.Call) &EVM.CadenceOwnedAccount
    let flowVault: auth(FungibleToken.Withdraw) &FlowToken.Vault

    prepare(signer: auth(Storage, BorrowValue) &Account) {
        self.coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(
            from: /storage/evm
        ) ?? panic("COA not found. Run setup_coa first.")

        self.flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("FlowToken vault not found")
    }

    execute {
        // WFLOW contract address on Flow mainnet
        let wflowAddress = EVM.EVMAddress(
            bytes: [0xd3, 0xbF, 0x53, 0xDA, 0xC1, 0x06, 0xA0, 0x29, 0x0B, 0x04,
                    0x83, 0xEc, 0xBC, 0x89, 0xd4, 0x0F, 0xCC, 0x96, 0x1f, 0x3e]
        )

        // Step 1: Deposit FLOW into COA
        let funding <- self.flowVault.withdraw(amount: amount) as! @FlowToken.Vault
        self.coa.deposit(from: <-funding)
        log("Deposited ".concat(amount.toString()).concat(" FLOW to COA"))

        // Step 2: Call WFLOW.deposit() to wrap
        let depositCalldata: [UInt8] = [0xd0, 0xe3, 0x0d, 0xb0]
        let amountInWei = EVM.Balance(attoflow: 0)
        amountInWei.setFLOW(flow: amount)

        let result = self.coa.call(
            to: wflowAddress,
            data: depositCalldata,
            gasLimit: 100000,
            value: amountInWei
        )

        if result.status != EVM.Status.successful {
            panic("WFLOW wrap failed with error code: ".concat(result.errorCode.toString()))
        }

        log("Wrapped ".concat(amount.toString()).concat(" FLOW to WFLOW"))
    }
}
`;

/**
 * Approve DCA service to spend tokens from user's COA
 * Shared COA Address: 0x000000000000000000000002623833e1789dbd4a
 */
export const APPROVE_DCA_TX = `
import EVM from 0xEVM

transaction(tokenAddress: String, amount: UInt256) {
    let coa: auth(EVM.Call) &EVM.CadenceOwnedAccount

    prepare(signer: auth(Storage, BorrowValue) &Account) {
        self.coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(
            from: /storage/evm
        ) ?? panic("COA not found. Run setup_coa first.")
    }

    execute {
        // DCAServiceEVM's shared COA address (the spender)
        let dcaCoaAddress = EVM.EVMAddress(
            bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                    0x00, 0x02, 0x62, 0x38, 0x33, 0xe1, 0x78, 0x9d, 0xbd, 0x4a]
        )

        // Parse token address from hex string
        let tokenBytes = tokenAddress.decodeHex()
        var tokenAddressBytes: [UInt8; 20] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        var i = 0
        while i < 20 && i < tokenBytes.length {
            tokenAddressBytes[i] = tokenBytes[i]
            i = i + 1
        }
        let tokenEVMAddress = EVM.EVMAddress(bytes: tokenAddressBytes)

        // Build approve(address spender, uint256 amount) calldata
        var calldata: [UInt8] = [0x09, 0x5e, 0xa7, 0xb3]

        // Pad spender address to 32 bytes
        var j = 0
        while j < 12 {
            calldata.append(0x00)
            j = j + 1
        }
        // Append spender address bytes
        calldata.append(0x00)
        calldata.append(0x00)
        calldata.append(0x00)
        calldata.append(0x00)
        calldata.append(0x00)
        calldata.append(0x00)
        calldata.append(0x00)
        calldata.append(0x00)
        calldata.append(0x00)
        calldata.append(0x00)
        calldata.append(0x00)
        calldata.append(0x02)
        calldata.append(0x62)
        calldata.append(0x38)
        calldata.append(0x33)
        calldata.append(0xe1)
        calldata.append(0x78)
        calldata.append(0x9d)
        calldata.append(0xbd)
        calldata.append(0x4a)

        // Encode amount as 32 bytes (big-endian)
        let amountBytes = amount.toBigEndianBytes()
        var k = 0
        while k < (32 - amountBytes.length) {
            calldata.append(0x00)
            k = k + 1
        }
        for byte in amountBytes {
            calldata.append(byte)
        }

        // Call approve on the token contract
        let result = self.coa.call(
            to: tokenEVMAddress,
            data: calldata,
            gasLimit: 100000,
            value: EVM.Balance(attoflow: 0)
        )

        if result.status != EVM.Status.successful {
            panic("Approve failed with error code: ".concat(result.errorCode.toString()))
        }

        log("Approved DCA service to spend tokens")
        log("Token: ".concat(tokenAddress))
        log("Amount: ".concat(amount.toString()))
    }
}
`;

/**
 * Get user's COA EVM address
 */
export const GET_USER_COA_SCRIPT = `
import EVM from 0xEVM

access(all) fun main(address: Address): String? {
    let account = getAccount(address)
    let coaCap = account.capabilities.get<&EVM.CadenceOwnedAccount>(/public/evm)

    if !coaCap.check() {
        return nil
    }

    let coa = coaCap.borrow()
    if coa == nil {
        return nil
    }

    return coa!.address().toString()
}
`;

// =============================================================================
// ADMIN TRANSACTIONS - Called by backend with deployer key
// =============================================================================

/**
 * Create a DCA plan (admin only)
 * Users don't call this directly - they approve tokens and backend creates plan
 */
export const CREATE_PLAN_TX = `
import EVM from 0xEVM
import DCAServiceEVM from 0xDCAServiceEVM

transaction(
    userEVMAddressHex: String,
    sourceTokenHex: String,
    targetTokenHex: String,
    amountPerInterval: UInt256,
    intervalSeconds: UInt64,
    maxSlippageBps: UInt64,
    maxExecutions: UInt64?,
    feeTier: UInt32,
    firstExecutionDelay: UFix64
) {
    prepare(signer: auth(Storage) &Account) {
        // Only admin should call this
    }

    execute {
        let userEVMAddress = EVM.addressFromString(userEVMAddressHex)
        let sourceToken = EVM.addressFromString(sourceTokenHex)
        let targetToken = EVM.addressFromString(targetTokenHex)
        let firstExecutionTime = getCurrentBlock().timestamp + firstExecutionDelay

        let planId = DCAServiceEVM.createPlan(
            userEVMAddress: userEVMAddress,
            sourceToken: sourceToken,
            targetToken: targetToken,
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds,
            maxSlippageBps: maxSlippageBps,
            maxExecutions: maxExecutions,
            feeTier: feeTier,
            firstExecutionTime: firstExecutionTime
        )

        log("Created DCA plan #".concat(planId.toString()))
    }
}
`;

/**
 * Pause a DCA plan (admin only)
 */
export const PAUSE_PLAN_TX = `
import DCAServiceEVM from 0xDCAServiceEVM

transaction(planId: UInt64) {
    prepare(signer: auth(Storage) &Account) {}

    execute {
        DCAServiceEVM.pausePlan(planId: planId)
        log("Paused plan ".concat(planId.toString()))
    }
}
`;

/**
 * Resume a DCA plan (admin only)
 */
export const RESUME_PLAN_TX = `
import DCAServiceEVM from 0xDCAServiceEVM

transaction(planId: UInt64, delaySeconds: UFix64?) {
    prepare(signer: auth(Storage) &Account) {}

    execute {
        let nextExecutionTime: UFix64? = delaySeconds != nil
            ? getCurrentBlock().timestamp + delaySeconds!
            : nil

        DCAServiceEVM.resumePlan(planId: planId, nextExecutionTime: nextExecutionTime)
        log("Resumed plan ".concat(planId.toString()))
    }
}
`;

/**
 * Cancel a DCA plan (admin only)
 */
export const CANCEL_PLAN_TX = `
import DCAServiceEVM from 0xDCAServiceEVM

transaction(planId: UInt64) {
    prepare(signer: auth(Storage) &Account) {}

    execute {
        DCAServiceEVM.cancelPlan(planId: planId)
        log("Cancelled plan ".concat(planId.toString()))
    }
}
`;

// =============================================================================
// TOKEN UTILITIES
// =============================================================================

/**
 * Get FLOW token balance for token balance display
 */
export const GET_TOKEN_BALANCE_SCRIPT = `
import FungibleToken from 0xFungibleToken
import FlowToken from 0xFlowToken

access(all) fun main(address: Address, tokenSymbol: String): UFix64 {
    let account = getAccount(address)

    if tokenSymbol == "FLOW" {
        let vaultRef = account.capabilities.borrow<&{FungibleToken.Balance}>(/public/flowTokenBalance)
        return vaultRef?.balance ?? 0.0
    }

    // For EVM tokens (USDC, USDF, WFLOW), user needs to check via their EVM wallet
    return 0.0
}
`;

/**
 * Get swappable tokens from IncrementFi (for token selector)
 */
export const GET_FLOW_SWAPPABLE_TOKENS_SCRIPT = `
import SwapFactory from 0xb063c16cac85dbd1
import SwapInterfaces from 0xb78ef7afa52ff906

access(all) struct TokenInfo {
    access(all) let symbol: String
    access(all) let tokenAddress: String
    access(all) let tokenContract: String
    access(all) let tokenIdentifier: String
    access(all) let pairAddress: String
    access(all) let flowReserve: String
    access(all) let tokenReserve: String
    access(all) let isStable: Bool

    init(
        symbol: String,
        tokenAddress: String,
        tokenContract: String,
        tokenIdentifier: String,
        pairAddress: String,
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
    let tokens: [TokenInfo] = []
    let flowTokenAddress = Address(0x1654653399040a61)
    let flowTokenType = Type<@FlowToken.Vault>()
    let flowTokenIdentifier = flowTokenType.identifier

    let pairAddresses = SwapFactory.getAllPairAddresses()

    for pairAddress in pairAddresses {
        let pairAccount = getAccount(pairAddress)
        let pairRef = pairAccount.capabilities.borrow<&{SwapInterfaces.PairPublic}>(/public/IncrementSwapPair)

        if pairRef == nil {
            continue
        }

        let pairInfo = pairRef!.getPairInfo()
        let token0Type = pairInfo[0] as! Type
        let token1Type = pairInfo[1] as! Type
        let reserve0 = pairInfo[2] as! UFix64
        let reserve1 = pairInfo[3] as! UFix64
        let isStable = pairInfo.length > 6 ? (pairInfo[6] as? Bool ?? false) : false

        // Check if this pair includes FLOW
        var otherTokenType: Type? = nil
        var flowReserve: UFix64 = 0.0
        var tokenReserve: UFix64 = 0.0

        if token0Type.identifier == flowTokenIdentifier {
            otherTokenType = token1Type
            flowReserve = reserve0
            tokenReserve = reserve1
        } else if token1Type.identifier == flowTokenIdentifier {
            otherTokenType = token0Type
            flowReserve = reserve1
            tokenReserve = reserve0
        }

        if otherTokenType == nil {
            continue
        }

        // Extract token info from type identifier
        let parts = otherTokenType!.identifier.split(separator: ".")
        if parts.length < 3 {
            continue
        }

        let tokenAddress = "0x".concat(parts[1])
        let tokenContract = parts[2]
        let symbol = tokenContract

        tokens.append(TokenInfo(
            symbol: symbol,
            tokenAddress: tokenAddress,
            tokenContract: tokenContract,
            tokenIdentifier: otherTokenType!.identifier,
            pairAddress: pairAddress.toString(),
            flowReserve: flowReserve.toString(),
            tokenReserve: tokenReserve.toString(),
            isStable: isStable
        ))
    }

    return tokens
}
`;
