import EVM from "EVM"
import DCAServiceEVM from "DCAServiceEVM"

/// Create a DCA plan for an EVM user
/// This is called by the backend with deployer key on behalf of users
///
/// The user only needs to:
/// 1. Approve the COA address via Metamask (ERC-20 approve)
/// 2. Call the backend API to create their plan
///
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
        // Only admin should be able to create plans
        // In production, add proper access control
    }

    execute {
        // Parse EVM addresses
        let userEVMAddress = EVM.addressFromString(userEVMAddressHex)
        let sourceToken = EVM.addressFromString(sourceTokenHex)
        let targetToken = EVM.addressFromString(targetTokenHex)

        // Calculate first execution time
        let firstExecutionTime = getCurrentBlock().timestamp + firstExecutionDelay

        // Create the plan
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

        log("Created DCA plan:")
        log("  Plan ID: ".concat(planId.toString()))
        log("  User: ".concat(userEVMAddressHex))
        log("  Source token: ".concat(sourceTokenHex))
        log("  Target token: ".concat(targetTokenHex))
        log("  Amount per interval: ".concat(amountPerInterval.toString()))
        log("  Interval: ".concat(intervalSeconds.toString()).concat(" seconds"))
        log("  Max slippage: ".concat(maxSlippageBps.toString()).concat(" bps"))
        log("  Fee tier: ".concat(feeTier.toString()))
        log("  First execution: ".concat(firstExecutionTime.toString()))

        // Log COA address for user to approve
        let coaAddress = DCAServiceEVM.getCOAAddress()
        log("")
        log("USER ACTION REQUIRED:")
        log("  Approve COA address for transferFrom: ".concat(coaAddress.toString()))
    }
}
