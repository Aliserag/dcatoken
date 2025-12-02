import "DCAController"
import "DCAPlan"
import "DeFiMath"
import "DCATransactionHandler"

/// Remove all DCA contracts from mainnet deployer account
/// This allows us to redeploy with updated versions
transaction {
    prepare(signer: auth(Contracts) &Account) {
        // Remove contracts in reverse dependency order
        signer.contracts.remove(name: "DCATransactionHandler")
        log("Removed DCATransactionHandler")

        signer.contracts.remove(name: "DCAController")
        log("Removed DCAController")

        signer.contracts.remove(name: "DCAPlan")
        log("Removed DCAPlan")

        signer.contracts.remove(name: "DeFiMath")
        log("Removed DeFiMath")

        log("All contracts removed successfully")
    }
}
