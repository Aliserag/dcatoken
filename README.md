# Flow DCA - Dollar-Cost Averaging on Flow

> An educational demo showcasing **Flow Scheduled Transactions**, **Atomic Transactions**, **EVM DeFi Integration**, and **Sponsored Transactions** - all on Flow blockchain.

This project demonstrates Flow's unique capabilities that aren't possible on other blockchains:

- **Native Scheduled Transactions** - No external keepers, oracles, or off-chain infrastructure
- **Cadence + EVM Interoperability** - Seamlessly interact with EVM DeFi protocols from Cadence
- **Gas-Free UX** - Metamask users never need FLOW tokens for gas

Unlike Chainlink Automation or off-chain keepers that require external infrastructure, fees, and trust assumptions, Flow's native Scheduled Transactions run directly onchain. This means zero external dependencies, no keeper fees, and guaranteed execution - all while staying fully decentralized.

---

## Key Features & Code Examples

### 1. Cadence → EVM Interoperability

Cadence smart contracts can directly call any EVM contract on Flow. This isn't a bridge or wrapped call—it's native interoperability where Cadence controls an EVM account (COA) and executes EVM transactions atomically.

Here, a Cadence contract executes a UniswapV3 swap by building the calldata and calling the EVM router:

**File:** [`cadence/contracts/DCAServiceEVM.cdc`](cadence/contracts/DCAServiceEVM.cdc)

```cadence
access(all) contract DCAServiceEVM {
    // Cadence contract owns an EVM account
    access(self) let coa: @EVM.CadenceOwnedAccount
    access(all) let routerAddress: EVM.EVMAddress  // UniswapV3 Router

    access(self) fun executeSwap(
        tokenIn: EVM.EVMAddress,
        tokenOut: EVM.EVMAddress,
        amountIn: UInt256,
        feeTier: UInt32
    ): UInt256 {
        // Build UniswapV3 exactInput path: tokenIn (20 bytes) + fee (3 bytes) + tokenOut (20 bytes)
        var pathBytes: [UInt8] = []
        for byte in tokenIn.bytes { pathBytes.append(byte) }
        pathBytes.append(UInt8((feeTier >> 16) & 0xFF))
        pathBytes.append(UInt8((feeTier >> 8) & 0xFF))
        pathBytes.append(UInt8(feeTier & 0xFF))
        for byte in tokenOut.bytes { pathBytes.append(byte) }

        // Build calldata: exactInput selector (0xb858183f) + encoded params
        let selector: [UInt8] = [0xb8, 0x58, 0x18, 0x3f]
        let calldata = selector.concat(self.encodeExactInputParams(pathBytes, ...))

        // Execute EVM call from Cadence - this is the magic!
        let result = self.coa.call(
            to: self.routerAddress,
            data: calldata,
            gasLimit: 500_000,
            value: EVM.Balance(attoflow: 0)
        )

        // Decode and return amount out
        if result.status == EVM.Status.successful {
            let decoded = EVM.decodeABI(types: [Type<UInt256>()], data: result.data)
            return decoded[0] as! UInt256
        }
        return 0
    }
}
```


- **Native interop** - Cadence contracts can use any EVM DeFi protocol (Uniswap, Aave, etc.)
- **Atomic execution** - EVM calls are part of the Cadence transaction (all-or-nothing)
- **No bridges** - Not a wrapped call or message passing; direct EVM execution
- **Full control** - Cadence logic decides when/how to call EVM based on on-chain state

---

### 2. Atomic Multi-Step Transactions

On EVM chains, wrapping ETH→WETH and approving a spender requires **2 separate transactions**. On Flow, Cadence can execute both EVM calls in **one atomic transaction**—if either fails, both revert.

**File:** [`src/lib/cadence-transactions.ts`](src/lib/cadence-transactions.ts) - `WRAP_AND_APPROVE_TX`

```cadence
transaction(amount: UFix64, spenderAddress: String, approvalAmount: UInt256) {
    let coa: auth(EVM.Call) &EVM.CadenceOwnedAccount

    execute {
        // ========== STEP 1: Wrap FLOW → WFLOW ==========
        let depositCalldata: [UInt8] = [0xd0, 0xe3, 0x0d, 0xb0]  // deposit()
        let wrapResult = self.coa.call(
            to: wflowAddress,
            data: depositCalldata,
            gasLimit: 100_000,
            value: amountInWei  // Send FLOW with the call
        )
        // If wrap fails, entire transaction reverts

        // ========== STEP 2: Approve DCA Service ==========
        // Build approve(address,uint256) calldata manually
        var calldata: [UInt8] = [0x09, 0x5e, 0xa7, 0xb3]  // approve selector

        // Encode spender address (pad to 32 bytes)
        var j = 0
        while j < 12 { calldata.append(0x00); j = j + 1 }
        for byte in spenderAddressBytes { calldata.append(byte) }

        // Encode amount (32-byte big-endian)
        let amountBytes = approvalAmount.toBigEndianBytes()
        var k = 0
        while k < (32 - amountBytes.length) { calldata.append(0x00); k = k + 1 }
        for byte in amountBytes { calldata.append(byte) }

        let approveResult = self.coa.call(
            to: wflowAddress,
            data: calldata,
            gasLimit: 100_000,
            value: EVM.Balance(attoflow: 0)
        )
        // If approve fails, wrap is also reverted - atomic!
    }
}
```


- **2 EVM transactions → 1 Cadence transaction** - Better UX, lower fees
- **Atomic guarantees** - Either both succeed or both revert (no stuck approvals)
- **No ABI libraries needed** - Manual encoding works in pure Cadence
- **Composable** - Can chain unlimited EVM calls in one transaction

---

### 3. Scheduled Transactions (Autonomous Execution)

Flow validators natively execute scheduled transactions—no Chainlink Keepers, no Gelato, no off-chain bots. Your handler runs exactly when scheduled, with cryptographic guarantees.

**File:** [`cadence/contracts/DCAHandlerEVMV4.cdc`](cadence/contracts/DCAHandlerEVMV4.cdc)

```cadence
/// Handler resource that executes scheduled DCA swaps
access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {

    /// Called automatically by Flow validators at the scheduled time
    access(FlowTransactionScheduler.Execute)
    fun executeTransaction(id: UInt64, data: AnyStruct?) {
        let txData = data as! TransactionData

        // Execute the DCA swap (calls into EVM via DCAServiceEVM)
        let success = DCAServiceEVM.executePlan(planId: txData.planId)

        // If successful and plan still active, schedule NEXT execution
        if success {
            self.scheduleNextExecution(
                planId: txData.planId,
                nextExecutionTime: plan.nextExecutionTime,
                loopConfig: txData.loopConfig
            )
        }
    }

    /// Self-rescheduling: the handler schedules its own next run
    access(self) fun scheduleNextExecution(
        planId: UInt64,
        nextExecutionTime: UFix64?,
        loopConfig: LoopConfig
    ): Bool {
        // Calculate fees based on execution effort and priority
        let baseFee = FlowFees.computeFees(
            inclusionEffort: 1.0,
            executionEffort: UFix64(loopConfig.executionEffort) / 100_000_000.0
        )
        let priorityMultiplier = FlowTransactionScheduler.getConfig()
            .priorityFeeMultipliers[loopConfig.priority]!
        let feeAmount = baseFee * priorityMultiplier * 1.05  // 5% buffer

        // Withdraw fees from pre-funded vault
        let feeVault = loopConfig.feeProviderCap.borrow()!
        let fees <- feeVault.withdraw(amount: feeAmount)

        // Schedule next execution - Handler schedules itself!
        let schedulerManager = loopConfig.schedulerManagerCap.borrow()!
        let scheduledId = schedulerManager.scheduleByHandler(
            handlerTypeIdentifier: self.getType().identifier,
            handlerUUID: self.uuid,
            data: TransactionData(planId: planId, loopConfig: loopConfig),
            timestamp: nextExecutionTime!,
            priority: loopConfig.priority,
            executionEffort: loopConfig.executionEffort,
            fees: <-fees as! @FlowToken.Vault
        )

        return scheduledId > 0
    }
}
```


- **No off-chain infrastructure** - Validators execute your handler, not external keepers
- **Self-rescheduling loops** - Handler schedules its own next execution (autonomous)
- **Guaranteed execution** - Scheduled transactions run or fees are refunded
- **Priority levels** - Low/Medium/High priority affects fee multiplier and execution order
- **Pre-funded fee vault** - Fees for all executions deposited upfront

---

### 4. Sponsored Transactions (Gas-Free UX)

Flow has a unique transaction model where every transaction has **three roles** that can be different accounts:
- **Proposer** - Provides sequence number (prevents replay attacks)
- **Payer** - Pays the gas fees
- **Authorizer** - Signs to authorize the transaction

This separation enables native gas sponsorship without smart contract paymasters.

#### Flow Wallet Users (Native Sponsorship)

Flow Wallet already sponsors transactions for its users. When a Flow Wallet user interacts with this app, the wallet infrastructure handles gas fees automatically using Flow's native payer separation.

#### Metamask Users (COA Relay Pattern)

Metamask users interact without paying gas for the scheduled transactions with a type of paymaster made possible through COAs and associated Cadence accounts:

```
┌─────────────────────────────────────────────────────────────────┐
│  Metamask User                                                   │
│  - Signs EVM transactions (token approvals)                     │
│  - Never needs FLOW tokens                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Relay                                     │
│  - Receives plan creation requests                              │
│  - Service account acts as PROPOSER + PAYER + AUTHORIZER        │
│  - Signs Cadence transactions server-side                       │
│  - Pays all gas fees from service account                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  DCA Service (Shared COA)                                        │
│  - Executes swaps using pre-approved token allowances           │
│  - Scheduled transaction fees paid from funded fee vault        │
└─────────────────────────────────────────────────────────────────┘
```

**File:** [`src/app/api/relay/route.ts`](src/app/api/relay/route.ts)

```typescript
// Service account signs as proposer, payer, AND authorizer
const txId = await fcl.mutate({
  cadence: createPlanTransaction,
  args: (arg, t) => [...],
  proposer: serviceSigner,   // Service account
  payer: serviceSigner,      // Service account pays gas
  authorizations: [serviceSigner],
  limit: 9999,
});

// The serviceSigner uses the correct curve for each network
const signWithKey = (privateKey, msgHex, signatureAlgorithm, hashAlgorithm) => {
  const curve = signatureAlgorithm === "ECDSA_secp256k1"
    ? secp256k1Curve  // Testnet
    : p256Curve;       // Mainnet
  const hash = hashAlgorithm === "SHA2_256"
    ? hashMessageSHA2(msgHex)
    : hashMessageSHA3(msgHex);
  // ... sign and return
};
```


- Flow's 3-role transaction model enables native sponsorship
- No smart contract paymaster needed (unlike EVM chains)
- Backend service pays all Cadence gas fees
- Users only sign EVM transactions (Metamask), never Cadence transactions
- Scheduled transaction fees are pre-funded into a fee vault

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
git clone https://github.com/Aliserag/dcatoken.git
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

1. **Token Approvals**: Users should only approve the amount they intend to DCA and not leave them open
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

- [GitHub Issues](https://github.com/Aliserag/dcatoken/issues)
- [Flow Discord](https://discord.gg/flow)

---

Built with Flow Scheduled Transactions and Cadence 1.0
