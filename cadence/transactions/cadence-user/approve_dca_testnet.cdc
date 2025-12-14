import EVM from "EVM"
import DCAServiceEVM from "DCAServiceEVM"

/// Approve the DCA service to spend tokens from the user's COA (TESTNET)
///
/// This approves the shared COA (DCAServiceEVM) to transfer tokens
/// from the user's COA for DCA execution.
///
/// Uses DCAServiceEVM.getCOAAddress() to get the correct spender address.
///
/// Parameters:
/// - tokenAddress: ERC-20 token to approve (e.g., WFLOW hex bytes without 0x)
/// - amount: Amount to approve in wei (use max uint256 for unlimited)
///
transaction(tokenAddress: String, amount: UInt256) {

    let coa: auth(EVM.Call) &EVM.CadenceOwnedAccount

    prepare(signer: auth(Storage, BorrowValue) &Account) {
        // Borrow COA
        self.coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(
            from: /storage/evm
        ) ?? panic("COA not found. Run setup_coa.cdc first.")
    }

    execute {
        // Get DCAServiceEVM's shared COA address from contract
        let dcaCoaAddress = DCAServiceEVM.getCOAAddress()

        // Parse token address from hex string (without 0x prefix)
        let tokenBytes = tokenAddress.decodeHex()
        var tokenAddressBytes: [UInt8; 20] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        var i = 0
        while i < 20 && i < tokenBytes.length {
            tokenAddressBytes[i] = tokenBytes[i]
            i = i + 1
        }
        let tokenEVMAddress = EVM.EVMAddress(bytes: tokenAddressBytes)

        // Build approve(address spender, uint256 amount) calldata
        // Function selector: 0x095ea7b3
        var calldata: [UInt8] = [0x09, 0x5e, 0xa7, 0xb3]

        // Pad spender address to 32 bytes (left-padded with zeros)
        var j = 0
        while j < 12 {
            calldata.append(0x00)
            j = j + 1
        }
        // Append spender address bytes from contract
        for byte in dcaCoaAddress.bytes {
            calldata.append(byte)
        }

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
        log("Spender (DCA COA): ".concat(dcaCoaAddress.toString()))
        log("")
        log("You can now create a DCA plan!")
    }
}
