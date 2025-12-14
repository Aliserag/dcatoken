import EVM from "EVM"
import DCAServiceEVM from "DCAServiceEVM"

/// Approve the DCA service to spend USDF from the user's COA
/// This is for users who want to DCA USDF -> FLOW
///
/// Parameters:
/// - amount: Amount of USDF to approve (in USDF units with 6 decimals)
///           For 1 USDF: 1000000
///           For unlimited: use max UInt256
///
transaction(amount: UInt256) {
    let coa: auth(EVM.Call) &EVM.CadenceOwnedAccount

    prepare(signer: auth(Storage) &Account) {
        // Borrow the COA
        self.coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(from: /storage/evm)
            ?? panic("No COA found. Run setup_coa.cdc first.")
    }

    execute {
        // Get the shared COA address from DCAServiceEVM
        let spender = DCAServiceEVM.getCOAAddress()

        // USDF address on Flow EVM mainnet
        let usdfAddress = EVM.addressFromString("0x2aaBea2058b5aC2D339b163C6Ab6f2b6d53aabED")

        // Encode approve(address,uint256)
        let calldata = EVM.encodeABIWithSignature("approve(address,uint256)", [spender, amount])

        let result = self.coa.call(
            to: usdfAddress,
            data: calldata,
            gasLimit: 100_000,
            value: EVM.Balance(attoflow: 0)
        )

        assert(result.status == EVM.Status.successful, message: "Approve failed")

        log("Approved DCA service to spend USDF")
        log("  Your COA: ".concat(self.coa.address().toString()))
        log("  Spender (DCA COA): ".concat(spender.toString()))
        log("  Amount approved: ".concat(amount.toString()).concat(" (6 decimals)"))
    }
}
