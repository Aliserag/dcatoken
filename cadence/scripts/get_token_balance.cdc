import FungibleToken from 0xFungibleToken
import FlowToken from 0xFlowToken
import TeleportedTetherToken from 0xcfdd90d4a00f7b5b

/// Get token balance for a given address and token type
/// @param address - The account address to query
/// @param tokenType - Token symbol ("FLOW" or "USDT")
/// @returns Balance as UFix64
access(all) fun main(address: Address, tokenType: String): UFix64 {
    let account = getAccount(address)

    if tokenType == "FLOW" {
        // Get FLOW balance
        let vaultRef = account.capabilities
            .get<&FlowToken.Vault>(/public/flowTokenBalance)
            .borrow()

        if vaultRef == nil {
            return 0.0
        }

        return vaultRef!.balance
    } else if tokenType == "USDT" {
        // Get USDT balance
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
