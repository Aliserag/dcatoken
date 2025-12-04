import EVM from "EVM"
import FungibleToken from "FungibleToken"
import FlowToken from "FlowToken"

/// EVMTokenRegistry: Registry mapping Cadence fungible tokens to their EVM addresses
///
/// This contract maintains a registry of token mappings between Cadence and Flow EVM.
/// It's used by the DCA system to resolve EVM addresses for cross-VM swaps.
///
/// Flow EVM Mainnet Chain ID: 747
///
access(all) contract EVMTokenRegistry {

    /// Events
    access(all) event TokenRegistered(
        cadenceType: String,
        evmAddress: String,
        symbol: String,
        decimals: UInt8
    )
    access(all) event TokenUpdated(
        cadenceType: String,
        oldEVMAddress: String,
        newEVMAddress: String
    )
    access(all) event TokenRemoved(cadenceType: String, evmAddress: String)

    /// Storage paths
    access(all) let AdminStoragePath: StoragePath
    access(all) let RegistryStoragePath: StoragePath

    /// Token info structure
    access(all) struct TokenInfo {
        access(all) let cadenceType: String
        access(all) let evmAddress: EVM.EVMAddress
        access(all) let symbol: String
        access(all) let decimals: UInt8
        access(all) let isNativelyEVM: Bool  // True if token originated on EVM

        init(
            cadenceType: String,
            evmAddress: EVM.EVMAddress,
            symbol: String,
            decimals: UInt8,
            isNativelyEVM: Bool
        ) {
            self.cadenceType = cadenceType
            self.evmAddress = evmAddress
            self.symbol = symbol
            self.decimals = decimals
            self.isNativelyEVM = isNativelyEVM
        }
    }

    /// Registry storage - maps Cadence type identifier to EVM address
    access(self) var tokenRegistry: {String: TokenInfo}

    /// Reverse lookup - maps EVM address (as hex string) to Cadence type
    access(self) var evmToCADence: {String: String}

    /// Well-known token addresses on Flow EVM Mainnet (Chain ID: 747)
    /// WFLOW - Wrapped FLOW
    access(all) let WFLOW_ADDRESS: EVM.EVMAddress
    /// Common stablecoin and token addresses
    access(all) let WETH_ADDRESS: EVM.EVMAddress
    access(all) let CBBTC_ADDRESS: EVM.EVMAddress
    access(all) let USDF_ADDRESS: EVM.EVMAddress

    /// Get EVM address for a Cadence token type
    access(all) fun getEVMAddress(_ cadenceType: Type): EVM.EVMAddress? {
        let typeId = cadenceType.identifier
        if let info = self.tokenRegistry[typeId] {
            return info.evmAddress
        }
        return nil
    }

    /// Get EVM address by type identifier string
    access(all) fun getEVMAddressByTypeId(_ typeId: String): EVM.EVMAddress? {
        if let info = self.tokenRegistry[typeId] {
            return info.evmAddress
        }
        return nil
    }

    /// Get token info for a Cadence type
    access(all) fun getTokenInfo(_ cadenceType: Type): TokenInfo? {
        return self.tokenRegistry[cadenceType.identifier]
    }

    /// Get token info by type identifier string
    access(all) fun getTokenInfoByTypeId(_ typeId: String): TokenInfo? {
        return self.tokenRegistry[typeId]
    }

    /// Get Cadence type for an EVM address
    access(all) fun getCadenceType(_ evmAddress: EVM.EVMAddress): String? {
        return self.evmToCADence[evmAddress.toString()]
    }

    /// Check if a token is registered
    access(all) fun isRegistered(_ cadenceType: Type): Bool {
        return self.tokenRegistry[cadenceType.identifier] != nil
    }

    /// Check if a token is registered by type identifier
    access(all) fun isRegisteredByTypeId(_ typeId: String): Bool {
        return self.tokenRegistry[typeId] != nil
    }

    /// Get all registered tokens
    access(all) fun getAllTokens(): [TokenInfo] {
        return self.tokenRegistry.values
    }

    /// Get EVM address for FLOW/WFLOW
    /// FLOW uses WFLOW on EVM side
    access(all) fun getFlowEVMAddress(): EVM.EVMAddress {
        return self.WFLOW_ADDRESS
    }

    /// Admin resource for managing the registry
    access(all) resource Admin {
        /// Register a new token mapping
        access(all) fun registerToken(
            cadenceType: String,
            evmAddressHex: String,
            symbol: String,
            decimals: UInt8,
            isNativelyEVM: Bool
        ) {
            pre {
                EVMTokenRegistry.tokenRegistry[cadenceType] == nil: "Token already registered"
            }

            let evmAddress = EVM.addressFromString(evmAddressHex)
            let info = TokenInfo(
                cadenceType: cadenceType,
                evmAddress: evmAddress,
                symbol: symbol,
                decimals: decimals,
                isNativelyEVM: isNativelyEVM
            )

            EVMTokenRegistry.tokenRegistry[cadenceType] = info
            EVMTokenRegistry.evmToCADence[evmAddressHex.toLower()] = cadenceType

            emit TokenRegistered(
                cadenceType: cadenceType,
                evmAddress: evmAddressHex,
                symbol: symbol,
                decimals: decimals
            )
        }

        /// Update an existing token's EVM address
        access(all) fun updateToken(
            cadenceType: String,
            newEVMAddressHex: String
        ) {
            pre {
                EVMTokenRegistry.tokenRegistry[cadenceType] != nil: "Token not registered"
            }

            let oldInfo = EVMTokenRegistry.tokenRegistry[cadenceType]!
            let oldAddressHex = oldInfo.evmAddress.toString()

            let newEvmAddress = EVM.addressFromString(newEVMAddressHex)
            let newInfo = TokenInfo(
                cadenceType: cadenceType,
                evmAddress: newEvmAddress,
                symbol: oldInfo.symbol,
                decimals: oldInfo.decimals,
                isNativelyEVM: oldInfo.isNativelyEVM
            )

            // Update registry
            EVMTokenRegistry.tokenRegistry[cadenceType] = newInfo

            // Update reverse lookup
            EVMTokenRegistry.evmToCADence.remove(key: oldAddressHex.toLower())
            EVMTokenRegistry.evmToCADence[newEVMAddressHex.toLower()] = cadenceType

            emit TokenUpdated(
                cadenceType: cadenceType,
                oldEVMAddress: oldAddressHex,
                newEVMAddress: newEVMAddressHex
            )
        }

        /// Remove a token from the registry
        access(all) fun removeToken(cadenceType: String) {
            pre {
                EVMTokenRegistry.tokenRegistry[cadenceType] != nil: "Token not registered"
            }

            let info = EVMTokenRegistry.tokenRegistry[cadenceType]!
            let evmAddressHex = info.evmAddress.toString()

            EVMTokenRegistry.tokenRegistry.remove(key: cadenceType)
            EVMTokenRegistry.evmToCADence.remove(key: evmAddressHex.toLower())

            emit TokenRemoved(cadenceType: cadenceType, evmAddress: evmAddressHex)
        }
    }

    /// Create admin resource
    access(all) fun createAdmin(): @Admin {
        return <- create Admin()
    }

    init() {
        // Initialize storage paths
        self.AdminStoragePath = /storage/EVMTokenRegistryAdmin
        self.RegistryStoragePath = /storage/EVMTokenRegistry

        // Initialize empty registry
        self.tokenRegistry = {}
        self.evmToCADence = {}

        // Initialize well-known EVM token addresses on Flow EVM Mainnet
        // WFLOW - Wrapped FLOW (used for native FLOW on EVM)
        self.WFLOW_ADDRESS = EVM.addressFromString("0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e")
        // WETH - Wrapped Ether (bridged)
        self.WETH_ADDRESS = EVM.addressFromString("0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590")
        // cbBTC - Coinbase Wrapped Bitcoin
        self.CBBTC_ADDRESS = EVM.addressFromString("0xA0197b2044D28b08Be34d98b23c9312158Ea9A18")
        // USDF - Flow native stablecoin
        self.USDF_ADDRESS = EVM.addressFromString("0x2aabea2058b5ac2d339b163c6ab6f2b6d53aabed")

        // Pre-register known tokens
        // FLOW -> WFLOW
        let flowTypeId = Type<@FlowToken.Vault>().identifier
        self.tokenRegistry[flowTypeId] = TokenInfo(
            cadenceType: flowTypeId,
            evmAddress: self.WFLOW_ADDRESS,
            symbol: "FLOW",
            decimals: 18,
            isNativelyEVM: false
        )
        self.evmToCADence["0xd3bf53dac106a0290b0483ecbc89d40fcc961f3e"] = flowTypeId
    }
}

