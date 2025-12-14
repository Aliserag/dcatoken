import EVM from "EVM"

/// Approve the DCA service to spend tokens from the user's COA
///
/// This approves the shared COA (DCAServiceEVM) to transfer tokens
/// from the user's COA for DCA execution.
///
/// Shared COA Address: 0x000000000000000000000002623833e1789dbd4a
///
/// Parameters:
/// - tokenAddress: ERC-20 token to approve (e.g., WFLOW or USDF)
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
        // Function selector: 0x095ea7b3
        var calldata: [UInt8] = [0x09, 0x5e, 0xa7, 0xb3]

        // Pad spender address to 32 bytes (left-padded with zeros)
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
        log("Spender (DCA COA): 0x000000000000000000000002623833e1789dbd4a")
        log("")
        log("You can now create a DCA plan!")
    }
}
