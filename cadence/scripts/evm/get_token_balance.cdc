import EVM from "EVM"
import DCAServiceEVM from "DCAServiceEVM"

/// Get ERC-20 token balance for a given user COA address
///
/// Parameters:
/// - userCOAAddress: User's COA address as hex string (with 0x prefix)
/// - tokenAddress: ERC-20 token address as hex string (with 0x prefix)
///
access(all) fun main(userCOAAddress: String, tokenAddress: String): UInt256 {
    // Parse user address (remove 0x prefix if present)
    var userHex = userCOAAddress
    if userHex.length > 2 && userHex.slice(from: 0, upTo: 2) == "0x" {
        userHex = userHex.slice(from: 2, upTo: userHex.length)
    }
    let userBytes = userHex.decodeHex()
    var userAddressBytes: [UInt8; 20] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    var i = 0
    while i < 20 && i < userBytes.length {
        userAddressBytes[i] = userBytes[i]
        i = i + 1
    }

    // Parse token address
    var tokenHex = tokenAddress
    if tokenHex.length > 2 && tokenHex.slice(from: 0, upTo: 2) == "0x" {
        tokenHex = tokenHex.slice(from: 2, upTo: tokenHex.length)
    }
    let tokenBytes = tokenHex.decodeHex()
    var tokenAddressBytes: [UInt8; 20] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    i = 0
    while i < 20 && i < tokenBytes.length {
        tokenAddressBytes[i] = tokenBytes[i]
        i = i + 1
    }

    // Build balanceOf(address) calldata
    // Function selector: 0x70a08231
    var calldata: [UInt8] = [0x70, 0xa0, 0x82, 0x31]

    // Pad address to 32 bytes
    var j = 0
    while j < 12 {
        calldata.append(0x00)
        j = j + 1
    }
    for byte in userAddressBytes {
        calldata.append(byte)
    }

    // Call the token contract using DCA's shared COA
    let tokenEVMAddress = EVM.EVMAddress(bytes: tokenAddressBytes)
    let result = DCAServiceEVM.callEVM(
        to: tokenEVMAddress,
        data: calldata,
        gasLimit: 100000
    )

    if result.status != EVM.Status.successful {
        return 0
    }

    // Decode uint256 result
    let data = result.data
    if data.length < 32 {
        return 0
    }

    var balance: UInt256 = 0
    i = 0
    while i < 32 {
        balance = balance << 8
        balance = balance + UInt256(data[i])
        i = i + 1
    }

    return balance
}
