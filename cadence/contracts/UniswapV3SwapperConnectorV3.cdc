import FungibleToken from 0xf233dcee88fe0abe
import FlowToken from 0x1654653399040a61
import EVM from 0xe467b9dd11fa00df
import Burner from 0xf233dcee88fe0abe
import FlowEVMBridgeUtils from 0x1e4aa0b87d10b141
import FlowEVMBridgeConfig from 0x1e4aa0b87d10b141
import DeFiActions from 0xca7ee55e4fc3251a

/// UniswapV3SwapperConnectorV3
///
/// DeFiActions Swapper connector for Uniswap V3 routers on Flow EVM.
/// Based on the official FlowActions UniswapV3SwapConnectors pattern.
///
/// Supports single-hop and multi-hop swaps using exactInput with proper
/// FlowEVMBridge integration for token bridging.
///
access(all) contract UniswapV3SwapperConnectorV3 {

    /// Events
    access(all) event SwapperCreated(
        routerAddress: String,
        tokenPath: [String],
        feePath: [UInt32]
    )
    access(all) event SwapExecuted(
        routerAddress: String,
        amountIn: UFix64,
        amountOut: UFix64,
        tokenPath: [String]
    )
    access(all) event QuoteFetched(
        quoterAddress: String,
        amountIn: UFix64,
        amountOut: UFix64
    )

    /// Storage paths
    access(all) let AdminStoragePath: StoragePath

    /// Default addresses for FlowSwap V3 on Flow EVM Mainnet
    access(all) let defaultRouterAddress: EVM.EVMAddress
    access(all) let defaultQuoterAddress: EVM.EVMAddress
    access(all) let defaultFactoryAddress: EVM.EVMAddress

    /// WFLOW address on Flow EVM Mainnet
    access(all) let wflowAddress: EVM.EVMAddress

    /// ABI Helper: Encode a UInt256 as 32 bytes (big-endian)
    access(all) fun abiUInt256(_ value: UInt256): [UInt8] {
        var result: [UInt8] = []
        var remaining = value
        var bytes: [UInt8] = []

        if remaining == 0 {
            bytes.append(0)
        } else {
            while remaining > 0 {
                bytes.append(UInt8(remaining % 256))
                remaining = remaining / 256
            }
        }

        // Pad to 32 bytes
        while bytes.length < 32 {
            bytes.append(0)
        }

        // Reverse to get big-endian
        var i = 31
        while i >= 0 {
            result.append(bytes[i])
            if i == 0 { break }
            i = i - 1
        }

        return result
    }

    /// ABI Helper: Encode an address as 32 bytes
    access(all) fun abiAddress(_ addr: EVM.EVMAddress): [UInt8] {
        var result: [UInt8] = []
        // 12 bytes of zero padding
        var i = 0
        while i < 12 {
            result.append(0)
            i = i + 1
        }
        // 20 bytes of address
        for byte in addr.bytes {
            result.append(byte)
        }
        return result
    }

    /// ABI Helper: Encode dynamic bytes with length prefix
    access(all) fun abiDynamicBytes(_ data: [UInt8]): [UInt8] {
        var result: [UInt8] = []
        // Length as uint256
        result = result.concat(self.abiUInt256(UInt256(data.length)))
        // Data
        result = result.concat(data)
        // Pad to 32-byte boundary
        let padding = (32 - (data.length % 32)) % 32
        var i = 0
        while i < padding {
            result.append(0)
            i = i + 1
        }
        return result
    }

    /// ABI Helper: Encode word (32 bytes)
    access(all) fun abiWord(_ value: UInt256): [UInt8] {
        return self.abiUInt256(value)
    }

    /// Encode exactInput tuple: (bytes path, address recipient, uint256 amountIn, uint256 amountOutMin)
    access(all) fun encodeExactInputTuple(
        pathBytes: [UInt8],
        recipient: EVM.EVMAddress,
        amountIn: UInt256,
        amountOutMin: UInt256
    ): [UInt8] {
        let tupleHeadSize = 32 * 4  // 4 fields: offset, address, uint256, uint256

        var head: [[UInt8]] = []
        var tail: [[UInt8]] = []

        // 1) bytes path (dynamic) -> offset to tail (after head)
        head.append(self.abiWord(UInt256(tupleHeadSize)))
        tail.append(self.abiDynamicBytes(pathBytes))

        // 2) address recipient
        head.append(self.abiAddress(recipient))

        // 3) uint256 amountIn
        head.append(self.abiUInt256(amountIn))

        // 4) uint256 amountOutMin
        head.append(self.abiUInt256(amountOutMin))

        // Concatenate head and tail
        var result: [UInt8] = []
        for part in head {
            result = result.concat(part)
        }
        for part in tail {
            result = result.concat(part)
        }
        return result
    }

    /// UniswapV3Swapper resource implementing DeFiActions.Swapper
    access(all) resource UniswapV3Swapper: DeFiActions.Swapper {
        /// Router address for V3 swaps
        access(all) let routerAddress: EVM.EVMAddress
        /// Quoter address for price quotes
        access(all) let quoterAddress: EVM.EVMAddress
        /// Factory address for pool lookups
        access(all) let factoryAddress: EVM.EVMAddress

        /// Token path for multi-hop swaps (at least 2 addresses)
        access(all) let tokenPath: [EVM.EVMAddress]
        /// Fee path for V3 pools (length = tokenPath.length - 1)
        access(all) let feePath: [UInt32]

        /// Input vault type (Cadence)
        access(self) let inVaultType: Type
        /// Output vault type (Cadence)
        access(self) let outVaultType: Type

        /// COA capability for EVM interactions
        access(self) let coaCapability: Capability<auth(EVM.Owner) &EVM.CadenceOwnedAccount>

        /// Track last execution effort (gas used)
        access(self) var lastGasUsed: UInt64

        init(
            routerAddress: EVM.EVMAddress,
            quoterAddress: EVM.EVMAddress,
            factoryAddress: EVM.EVMAddress,
            tokenPath: [EVM.EVMAddress],
            feePath: [UInt32],
            inVaultType: Type,
            outVaultType: Type,
            coaCapability: Capability<auth(EVM.Owner) &EVM.CadenceOwnedAccount>
        ) {
            pre {
                tokenPath.length >= 2: "tokenPath must contain at least two addresses"
                feePath.length == tokenPath.length - 1: "feePath length must be tokenPath.length - 1"
                coaCapability.check(): "Invalid COA Capability"
            }
            self.routerAddress = routerAddress
            self.quoterAddress = quoterAddress
            self.factoryAddress = factoryAddress
            self.tokenPath = tokenPath
            self.feePath = feePath
            self.inVaultType = inVaultType
            self.outVaultType = outVaultType
            self.coaCapability = coaCapability
            self.lastGasUsed = 0
        }

        /// Build V3 path bytes: token0 + fee0 + token1 + fee1 + token2 ...
        access(self) fun buildPathBytes(reverse: Bool): [UInt8] {
            var path: [UInt8] = []

            // Build indices based on direction
            let length = self.tokenPath.length

            var i = 0
            while i < length {
                // Get index based on direction
                let tokenIdx = reverse ? (length - 1 - i) : i
                let feeIdx = reverse ? (self.feePath.length - 1 - i) : i

                // Add token address (20 bytes)
                for byte in self.tokenPath[tokenIdx].bytes {
                    path.append(byte)
                }

                // Add fee tier (3 bytes, big-endian) if not last token
                if i < self.feePath.length {
                    let fee = self.feePath[feeIdx]
                    path.append(UInt8((fee >> 16) & 0xFF))
                    path.append(UInt8((fee >> 8) & 0xFF))
                    path.append(UInt8(fee & 0xFF))
                }
                i = i + 1
            }
            return path
        }

        /// Execute swap on Uniswap V3 via exactInput
        /// Uses FlowEVMBridge for token bridging - the bridge handles FLOW↔WFLOW automatically
        access(all) fun swap(
            inVault: @{FungibleToken.Vault},
            quote: DeFiActions.Quote
        ): @{FungibleToken.Vault} {
            let originalAmount = inVault.balance
            let minOut = quote.minAmount

            let coa = self.coaCapability.borrow()
                ?? panic("Invalid COA Capability")

            // Get input/output token addresses from path
            let inToken = self.tokenPath[0]
            let outToken = self.tokenPath[self.tokenPath.length - 1]

            // Round DOWN to nearest 10^10 wei (Cadence-compatible precision)
            let evmWei = FlowEVMBridgeUtils.convertCadenceAmountToERC20Amount(
                originalAmount,
                erc20Address: inToken
            )

            let precision: UInt256 = 10_000_000_000 // 10^10
            let cleanWei = (evmWei / precision) * precision

            let cleanAmount = FlowEVMBridgeUtils.convertERC20AmountToCadenceAmount(
                cleanWei,
                erc20Address: inToken
            )

            let amountIn = cleanAmount > 0.0 ? cleanAmount : originalAmount

            // Withdraw only the clean amount from the vault
            var vaultToBridge: @{FungibleToken.Vault}? <- nil
            if amountIn < originalAmount && amountIn > 0.0 {
                vaultToBridge <-! inVault.withdraw(amount: amountIn)
                destroy inVault
            } else {
                vaultToBridge <-! inVault
            }

            // Convert amounts to EVM format
            let evmAmountIn = FlowEVMBridgeUtils.convertCadenceAmountToERC20Amount(
                amountIn,
                erc20Address: inToken
            )
            let evmAmountOutMin = FlowEVMBridgeUtils.convertCadenceAmountToERC20Amount(
                minOut,
                erc20Address: outToken
            )

            // Calculate bridge fee (2x for deposit + withdraw)
            let bridgeFee = 2.0 * FlowEVMBridgeUtils.calculateBridgeFee(bytes: 256)
            let bridgeFeeBalance = EVM.Balance(attoflow: 0)
            bridgeFeeBalance.setFLOW(flow: bridgeFee)

            // Check COA balance for fees
            let coaBalance = coa.balance()
            let requiredAttoflow = bridgeFeeBalance.attoflow

            if coaBalance.attoflow < requiredAttoflow {
                if self.inVaultType == Type<@FlowToken.Vault>() {
                    let feeDeposit = 0.02
                    var tempVault <- vaultToBridge <- nil
                    let unwrappedVault <- tempVault!
                    let feeFunding <- unwrappedVault.withdraw(amount: feeDeposit)
                    vaultToBridge <-! unwrappedVault
                    coa.deposit(from: <-(feeFunding as! @FlowToken.Vault))
                } else {
                    panic("COA has insufficient FLOW for bridge fees. Please fund your COA.")
                }
            }

            let feeVault <- coa.withdraw(balance: bridgeFeeBalance)
            let feeVaultRef = &feeVault as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}

            // Bridge input tokens to EVM
            coa.depositTokens(vault: <-vaultToBridge!, feeProvider: feeVaultRef)

            // Build V3 path bytes
            let pathBytes = self.buildPathBytes(reverse: false)

            // Approve router to spend input tokens
            let approveData = EVM.encodeABIWithSignature(
                "approve(address,uint256)",
                [self.routerAddress, evmAmountIn]
            )
            let approveResult = coa.call(
                to: inToken,
                data: approveData,
                gasLimit: 120_000,
                value: EVM.Balance(attoflow: 0)
            )
            if approveResult.status != EVM.Status.successful {
                panic("Failed to approve router: ".concat(approveResult.errorMessage))
            }

            // exactInput selector: 0xb858183f
            let selector: [UInt8] = [0xb8, 0x58, 0x18, 0x3f]

            let argsBlob = UniswapV3SwapperConnectorV3.encodeExactInputTuple(
                pathBytes: pathBytes,
                recipient: coa.address(),
                amountIn: evmAmountIn,
                amountOutMin: evmAmountOutMin
            )

            let head = UniswapV3SwapperConnectorV3.abiWord(UInt256(32))
            let calldata = selector.concat(head).concat(argsBlob)

            // Execute the swap
            var swapResult = coa.call(
                to: self.routerAddress,
                data: calldata,
                gasLimit: 2_000_000,
                value: EVM.Balance(attoflow: 0)
            )

            var evmAmountOut: UInt256 = 0

            if swapResult.status == EVM.Status.successful {
                let decoded = EVM.decodeABI(types: [Type<UInt256>()], data: swapResult.data)
                evmAmountOut = decoded.length > 0 ? decoded[0] as! UInt256 : UInt256(0)
                self.lastGasUsed = swapResult.gasUsed
            } else {
                panic("V3 swap FAILED. Error: ".concat(swapResult.errorMessage))
            }

            // Query output token decimals
            let decimalsData = EVM.encodeABIWithSignature("decimals()", [])
            let decimalsResult = coa.call(
                to: outToken,
                data: decimalsData,
                gasLimit: 50_000,
                value: EVM.Balance(attoflow: 0)
            )

            var outDecimals: UInt8 = 18
            if decimalsResult.status == EVM.Status.successful && decimalsResult.data.length > 0 {
                let decoded = EVM.decodeABI(types: [Type<UInt8>()], data: decimalsResult.data)
                if decoded.length > 0 {
                    outDecimals = decoded[0] as! UInt8
                }
            }

            // Calculate precision for output
            var outputPrecision: UInt256 = 1
            if outDecimals > 8 {
                let exponent = outDecimals - 8
                var i: UInt8 = 0
                while i < exponent {
                    outputPrecision = outputPrecision * 10
                    i = i + 1
                }
            }

            let cleanAmountOut = (evmAmountOut / outputPrecision) * outputPrecision

            if cleanAmountOut == 0 {
                panic("Swap returned zero output after precision rounding")
            }

            // Withdraw output tokens back to Cadence
            let outVault <- coa.withdrawTokens(
                type: self.outVaultType,
                amount: cleanAmountOut,
                feeProvider: feeVaultRef
            )

            // Handle leftover fee vault
            if feeVault.balance > 0.0 {
                coa.deposit(from: <-feeVault)
            } else {
                Burner.burn(<-feeVault)
            }

            let cadenceAmountOut = FlowEVMBridgeUtils.convertERC20AmountToCadenceAmount(
                cleanAmountOut,
                erc20Address: outToken
            )

            emit SwapExecuted(
                routerAddress: self.routerAddress.toString(),
                amountIn: amountIn,
                amountOut: cadenceAmountOut,
                tokenPath: self.getTokenPathStrings()
            )

            return <- outVault
        }

        /// Get quote using V3 Quoter
        access(all) fun getQuote(
            fromTokenType: Type,
            toTokenType: Type,
            amount: UFix64
        ): DeFiActions.Quote {
            let coa = self.coaCapability.borrow()

            if coa != nil {
                let inToken = self.tokenPath[0]
                let outToken = self.tokenPath[self.tokenPath.length - 1]

                let evmAmount = FlowEVMBridgeUtils.convertCadenceAmountToERC20Amount(
                    amount,
                    erc20Address: inToken
                )

                let pathBytes = EVM.EVMBytes(value: self.buildPathBytes(reverse: false))

                let quoteData = EVM.encodeABIWithSignature(
                    "quoteExactInput(bytes,uint256)",
                    [pathBytes, evmAmount]
                )

                let quoteResult = coa!.dryCall(
                    to: self.quoterAddress,
                    data: quoteData,
                    gasLimit: 1_000_000,
                    value: EVM.Balance(attoflow: 0)
                )

                if quoteResult.status == EVM.Status.successful && quoteResult.data.length > 0 {
                    let decoded = EVM.decodeABI(types: [Type<UInt256>()], data: quoteResult.data)
                    if decoded.length > 0 {
                        let evmAmountOut = decoded[0] as! UInt256
                        let expectedOut = FlowEVMBridgeUtils.convertERC20AmountToCadenceAmount(
                            evmAmountOut,
                            erc20Address: outToken
                        )
                        let minAmount = expectedOut * 0.90

                        emit QuoteFetched(
                            quoterAddress: self.quoterAddress.toString(),
                            amountIn: amount,
                            amountOut: expectedOut
                        )

                        return DeFiActions.Quote(
                            expectedAmount: expectedOut,
                            minAmount: minAmount,
                            slippageTolerance: 0.10,
                            deadline: nil,
                            data: {
                                "dex": "UniswapV3" as AnyStruct,
                                "tokenPath": self.getTokenPathStrings() as AnyStruct
                            }
                        )
                    }
                }
            }

            // Fallback estimate
            return DeFiActions.Quote(
                expectedAmount: amount * 0.99,
                minAmount: amount * 0.89,
                slippageTolerance: 0.10,
                deadline: nil,
                data: {
                    "dex": "UniswapV3" as AnyStruct,
                    "estimated": true as AnyStruct
                }
            )
        }

        /// Get token path as strings
        access(self) fun getTokenPathStrings(): [String] {
            var result: [String] = []
            for token in self.tokenPath {
                result.append(token.toString())
            }
            return result
        }

        /// Get execution effort from last swap
        access(all) fun getLastExecutionEffort(): UInt64 {
            return self.lastGasUsed
        }

        /// Get swapper info
        access(all) fun getInfo(): DeFiActions.ComponentInfo {
            return DeFiActions.ComponentInfo(
                type: "Swapper",
                identifier: "UniswapV3",
                version: "3.0.0"
            )
        }
    }

    /// Create V3 swapper with token path and fee path
    access(all) fun createSwapper(
        routerAddress: EVM.EVMAddress,
        quoterAddress: EVM.EVMAddress,
        factoryAddress: EVM.EVMAddress,
        tokenPath: [EVM.EVMAddress],
        feePath: [UInt32],
        inVaultType: Type,
        outVaultType: Type,
        coaCapability: Capability<auth(EVM.Owner) &EVM.CadenceOwnedAccount>
    ): @UniswapV3Swapper {
        var pathStrings: [String] = []
        for token in tokenPath {
            pathStrings.append(token.toString())
        }

        emit SwapperCreated(
            routerAddress: routerAddress.toString(),
            tokenPath: pathStrings,
            feePath: feePath
        )

        return <- create UniswapV3Swapper(
            routerAddress: routerAddress,
            quoterAddress: quoterAddress,
            factoryAddress: factoryAddress,
            tokenPath: tokenPath,
            feePath: feePath,
            inVaultType: inVaultType,
            outVaultType: outVaultType,
            coaCapability: coaCapability
        )
    }

    /// Create swapper with FlowSwap V3 defaults
    access(all) fun createSwapperWithDefaults(
        tokenPath: [EVM.EVMAddress],
        feePath: [UInt32],
        inVaultType: Type,
        outVaultType: Type,
        coaCapability: Capability<auth(EVM.Owner) &EVM.CadenceOwnedAccount>
    ): @UniswapV3Swapper {
        return <- self.createSwapper(
            routerAddress: self.defaultRouterAddress,
            quoterAddress: self.defaultQuoterAddress,
            factoryAddress: self.defaultFactoryAddress,
            tokenPath: tokenPath,
            feePath: feePath,
            inVaultType: inVaultType,
            outVaultType: outVaultType,
            coaCapability: coaCapability
        )
    }

    /// Admin resource
    access(all) resource Admin {
        // Admin functions for future updates
    }

    init() {
        self.AdminStoragePath = /storage/UniswapV3SwapperConnectorV3Admin

        // FlowSwap V3 Mainnet addresses
        self.defaultRouterAddress = EVM.addressFromString("0xeEDC6Ff75e1b10B903D9013c358e446a73d35341")
        self.defaultFactoryAddress = EVM.addressFromString("0xca6d7Bb03334bBf135902e1d919a5feccb461632")
        self.defaultQuoterAddress = EVM.addressFromString("0x370A8DF17742867a44e56223EC20D82092242C85")

        // WFLOW on Flow EVM Mainnet
        self.wflowAddress = EVM.addressFromString("0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e")
    }
}
