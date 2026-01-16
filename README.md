# Flow DCA - Dollar-Cost Averaging on Flow

> An educational demo showcasing **Flow Scheduled Transactions**, **EVM DeFi Integration**, and **Sponsored Transactions** - all on Flow blockchain.

## What Makes This Special

This project demonstrates Flow's unique capabilities that aren't possible on other blockchains:

- **Native Scheduled Transactions** - No external keepers, oracles, or off-chain infrastructure
- **Cadence + EVM Interoperability** - Seamlessly interact with EVM DeFi protocols from Cadence
- **Gas-Free UX** - Metamask users never need FLOW tokens for gas

Unlike Chainlink Automation or off-chain keepers that require external infrastructure, fees, and trust assumptions, Flow's native Scheduled Transactions run directly on blockchain validators. This means zero external dependencies, no keeper fees, and guaranteed execution - all while staying fully decentralized.

---

## Key Features & Code Examples

### 1. DeFi Actions with Flow EVM

Execute UniswapV3 swaps directly from Cadence smart contracts.

**File:** [`cadence/contracts/DCAServiceEVM.cdc`](cadence/contracts/DCAServiceEVM.cdc)

```cadence
// Execute swap on UniswapV3 via Cadence Owned Account (COA)
access(self) fun executeSwap(...) -> UInt256 {
    // Build UniswapV3 exactInput path: tokenIn + fee + tokenOut
    var pathBytes: [UInt8] = []
    for byte in tokenIn.bytes { pathBytes.append(byte) }
    pathBytes.append(UInt8((feeTier >> 16) & 0xFF))
    pathBytes.append(UInt8((feeTier >> 8) & 0xFF))
    pathBytes.append(UInt8(feeTier & 0xFF))
    for byte in tokenOut.bytes { pathBytes.append(byte) }

    // exactInput selector: 0xb858183f
    let selector: [UInt8] = [0xb8, 0x58, 0x18, 0x3f]
    let calldata = selector.concat(encodedParams)

    // Call UniswapV3 router from Cadence
    let swapResult = self.coa.call(
        to: self.routerAddress,
        data: calldata,
        gasLimit: 500_000,
        value: EVM.Balance(attoflow: 0)
    )
}
```

**What this demonstrates:**
- ABI encoding in pure Cadence
- Calling EVM contracts from Cadence via COA
- Building complex DeFi calldata (UniswapV3 path encoding)

---

### 2. DeFi Actions with Cadence

Interact with ERC-20 tokens using manual ABI encoding in Cadence.

**File:** [`src/lib/cadence-transactions.ts`](src/lib/cadence-transactions.ts) - `WRAP_AND_APPROVE_TX`

```cadence
// Manual ABI encoding for ERC-20 approve(address,uint256)
var calldata: [UInt8] = [0x09, 0x5e, 0xa7, 0xb3]  // approve selector

// Pad spender address to 32 bytes
var j = 0
while j < 12 { calldata.append(0x00); j = j + 1 }
for byte in spenderAddressBytes { calldata.append(byte) }

// Encode amount as 32-byte big-endian
let amountBytes = amount.toBigEndianBytes()
var k = 0
while k < (32 - amountBytes.length) { calldata.append(0x00); k = k + 1 }
for byte in amountBytes { calldata.append(byte) }

// Execute EVM call
let result = coa.call(to: tokenAddress, data: calldata, gasLimit: 100_000, ...)
```

**What this demonstrates:**
- How to call any EVM contract from Cadence
- Manual ABI encoding without external libraries
- Combining multiple operations (wrap + approve) in one transaction

---

### 3. Scheduled Transactions (Autonomous Execution)

The heart of Flow DCA - transactions that execute themselves on a schedule.

**File:** [`cadence/contracts/DCAHandlerEVMV4.cdc`](cadence/contracts/DCAHandlerEVMV4.cdc)

```cadence
/// Handler resource that executes scheduled DCA swaps
access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {

    /// Called by the network at the scheduled time
    access(FlowTransactionScheduler.Execute)
    fun executeTransaction(data: AnyStruct): AnyStruct? {
        let txData = data as! TransactionData

        // 1. Execute the DCA swap
        DCAServiceEVM.executePlan(planId: txData.planId)

        // 2. Automatically reschedule for next execution
        self.scheduleNextExecution(
            planId: txData.planId,
            loopConfig: txData.loopConfig
        )
        return nil
    }

    /// Autonomous rescheduling using Manager pattern
    access(self) fun scheduleNextExecution(...): Bool {
        // Calculate fees
        let baseFee = FlowFees.computeFees(
            inclusionEffort: 1.0,
            executionEffort: UFix64(loopConfig.executionEffort) / 100000000.0
        )

        // Schedule next execution via Manager
        let scheduledId = schedulerManager!.scheduleByHandler(
            handlerTypeIdentifier: self.getType().identifier,
            handlerUUID: self.uuid,
            data: nextTxData,
            timestamp: nextExecutionTime!,
            priority: loopConfig.priority,
            executionEffort: loopConfig.executionEffort,
            fees: <-fees
        )
    }
}
```

**What this demonstrates:**
- Implementing `FlowTransactionScheduler.TransactionHandler` interface
- Self-rescheduling (autonomous loops)
- Manager pattern for scheduled transactions
- Fee calculation for different priorities

---

### 4. Sponsored Transactions for Metamask Users

Metamask users can use the app without ever needing FLOW tokens for gas.

**File:** [`src/app/api/relay/route.ts`](src/app/api/relay/route.ts)

```typescript
// Backend signs transactions on behalf of users
const createServiceSigner = (config: NetworkConfig) => {
  return async (account: any): Promise<any> => {
    return {
      ...account,
      addr: fcl.sansPrefix(config.serviceAddress),
      keyId: config.serviceKeyId,
      signingFunction: async (signable: any) => ({
        addr: fcl.withPrefix(config.serviceAddress),
        keyId: config.serviceKeyId,
        signature: signWithKey(
          config.privateKey!,
          signable.message,
          config.signatureAlgorithm,
          config.hashAlgorithm
        ),
      }),
    };
  };
};

// Supports different curves for different networks
const signWithKey = (privateKey, msgHex, signatureAlgorithm, hashAlgorithm) => {
  const curve = signatureAlgorithm === "ECDSA_secp256k1"
    ? secp256k1Curve
    : p256Curve;
  const hash = hashAlgorithm === "SHA2_256"
    ? hashMessageSHA2(msgHex)
    : hashMessageSHA3(msgHex);
  // ... sign and return
};
```

**What this demonstrates:**
- Backend service account pays all gas fees
- Network-agnostic signing (different curves for testnet/mainnet)
- FCL integration for server-side signing
- Users only sign EVM transactions (Metamask), never Cadence transactions

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Creates DCA Plan                         │
│            "Swap 0.1 WFLOW → USDF every hour"                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   EVM Token Approval                             │
│   User approves WFLOW to DCA Service's shared COA address        │
│   (One-time approval via Metamask)                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Plan Scheduled via Backend                      │
│   Service account schedules first execution via                  │
│   FlowTransactionScheduler (gas sponsored)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ⏰ At Scheduled Time
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              Handler Executes Automatically                      │
│                                                                  │
│   1. Pull WFLOW from user via COA (transferFrom)                │
│   2. Execute swap on Uniswap V3 (WFLOW → USDF)                  │
│   3. Transfer USDF to user's EVM address                        │
│   4. Update plan statistics                                      │
│   5. Reschedule next execution (autonomous loop)                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    (Repeats until complete)
```

---

## Architecture

### Smart Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| `DCAServiceEVM` | `0xca7ee55e4fc3251a` (mainnet) | Core DCA logic, plan management, EVM swaps |
| `DCAHandlerEVMV4` | Same as above | Scheduled transaction handler |

### EVM Integration

The service uses a **shared Cadence Owned Account (COA)** to interact with EVM:

- **Mainnet COA**: `0x000000000000000000000002623833e1789dbd4a`

Users approve ERC-20 tokens to this COA, which executes swaps on their behalf.

### Supported Tokens

| Token | Mainnet Address |
|-------|-----------------|
| WFLOW | `0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e` |
| USDF | `0x2aaBea2058b5aC2D339b163C6Ab6f2b6d53aabED` |
| USDC | `0xF1815bd50389c46847f0Bda824eC8da914045D14` |

---

## Quick Start

### Prerequisites

- [Flow CLI](https://developers.flow.com/tools/flow-cli/install) v1.0+
- [Node.js](https://nodejs.org/) v18+
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/onflow/dcatoken.git
cd dcatoken

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your private keys
```

### Running the App

```bash
# Development
npm run dev

# Production build
npm run build && npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Verify Setup

```bash
# Check Flow CLI version
flow version  # Should be v1.0+

# Test network connection
flow scripts execute cadence/scripts/evm/get_total_plans.cdc --network mainnet
```

---

## Project Structure

```
dcatoken/
├── cadence/
│   ├── contracts/
│   │   ├── DCAServiceEVM.cdc         # Core service: plans, swaps, EVM calls
│   │   └── DCAHandlerEVMV4.cdc       # Scheduled transaction handler
│   ├── transactions/
│   │   └── evm/
│   │       ├── init_handler_v4.cdc   # Initialize handler capabilities
│   │       └── schedule_plan_v4.cdc  # Schedule plan execution
│   └── scripts/
│       └── evm/                      # Query scripts
├── src/
│   ├── app/
│   │   └── api/relay/route.ts        # Backend relay (gas sponsoring)
│   ├── components/dca/               # React components
│   ├── config/fcl-config.ts          # FCL configuration
│   └── lib/
│       ├── cadence-transactions.ts   # Cadence templates
│       └── transaction-relay.ts      # Relay API client
└── flow.json                         # Flow project config
```

---

## Deploying Your Own Instance

### 1. Generate Keys

```bash
flow keys generate
```

Save the private key securely. **Never commit it to git.**

### 2. Configure flow.json

Add your account to `flow.json`:

```json
{
  "accounts": {
    "my-deployer": {
      "address": "YOUR_ADDRESS",
      "key": {
        "type": "hex",
        "index": 0,
        "signatureAlgorithm": "ECDSA_P256",
        "hashAlgorithm": "SHA3_256",
        "privateKey": "${MY_PRIVATE_KEY}"
      }
    }
  }
}
```

### 3. Deploy Contracts

```bash
flow project deploy --network testnet
```

### 4. Update Frontend Config

Update `src/config/fcl-config.ts` with your deployed contract addresses.

---

## Security Considerations

1. **Token Approvals**: Users should only approve the amount they intend to DCA
2. **Slippage**: Configure appropriate slippage tolerance (default: 1%)
3. **Service Account**: Keep relay API private keys secure and rotate regularly
4. **COA Security**: The shared COA can only execute approved operations

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Resources

- [Flow Documentation](https://developers.flow.com)
- [Cadence Language Reference](https://cadence-lang.org)
- [Flow Scheduled Transactions](https://developers.flow.com/build/advanced-concepts/scheduled-transactions)
- [FCL Documentation](https://developers.flow.com/tools/clients/fcl-js)

---

## Support

- [GitHub Issues](https://github.com/onflow/dcatoken/issues)
- [Flow Discord](https://discord.gg/flow)

---

Built with Flow Scheduled Transactions and Cadence 1.0
