import EVM from "EVM"
import FungibleToken from "FungibleToken"
import FlowToken from "FlowToken"

/// Wrap FLOW to WFLOW for a Cadence user
///
/// This deposits FLOW into the user's COA and then wraps it to WFLOW
/// by calling the WFLOW contract's deposit() function.
///
/// WFLOW Contract: 0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e
///
/// Parameters:
/// - amount: Amount of FLOW to wrap (e.g., 1.0)
///
transaction(amount: UFix64) {

    let coa: auth(EVM.Call) &EVM.CadenceOwnedAccount
    let flowVault: auth(FungibleToken.Withdraw) &FlowToken.Vault

    prepare(signer: auth(Storage, BorrowValue) &Account) {
        // Borrow COA
        self.coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(
            from: /storage/evm
        ) ?? panic("COA not found. Run setup_coa.cdc first.")

        // Borrow FLOW vault
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

        // Step 1: Deposit FLOW into COA (converts to native EVM balance)
        let funding <- self.flowVault.withdraw(amount: amount) as! @FlowToken.Vault
        self.coa.deposit(from: <-funding)

        log("Deposited ".concat(amount.toString()).concat(" FLOW to COA"))

        // Step 2: Call WFLOW.deposit() to wrap the FLOW
        // deposit() function signature: 0xd0e30db0
        let depositCalldata: [UInt8] = [0xd0, 0xe3, 0x0d, 0xb0]

        // Convert UFix64 to UInt256 wei (multiply by 10^18)
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
        log("")
        log("Your COA now holds WFLOW at address: ".concat(self.coa.address().toString()))
    }
}
