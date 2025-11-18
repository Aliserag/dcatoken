# DCA Token - Dollar Cost Averaging on Flow

> Automated, on-chain DCA investing using Forte Scheduled Transactions and Flow Actions

## 📖 Project Overview

**DCA Token** is an educational, production-quality dapp showcasing Flow's Forte features:

- **Cadence 1.0 Only** - Modern, safe smart contract patterns
- **Forte Scheduled Transactions** - Autonomous, recurring on-chain execution
- **Flow Actions (DeFi Actions)** - Composable DeFi primitives for swaps
- **IncrementFi Integration** - DEX swaps via official Flow Actions connectors
- **128-bit Fixed-Point Math** - High-precision DeFi calculations for slippage and average price tracking

### Default DCA Pair

This demo implements:
- **Source Asset**: FLOW (`A.1654653399040a61.FlowToken`)
- **Target Asset**: Beaver (`A.687e1a7aef17b78b.Beaver`)
- **DEX**: IncrementFi (via Flow Actions swap connectors)

The architecture is fully configurable to support other token pairs.

---

## 🏗 Architecture

### Contract Architecture

```
┌─────────────────────────────────────────────────────┐
│                    User's Account                    │
├─────────────────────────────────────────────────────┤
│  DCAController                                       │
│  ├── DCAPlan #1 (Active)                            │
│  ├── DCAPlan #2 (Paused)                            │
│  └── Vault Capabilities                              │
│      ├── Source (FLOW) - Withdraw                   │
│      └── Target (Beaver) - Deposit                  │
└─────────────────────────────────────────────────────┘
                         │
                         │ Scheduled Execution
                         ↓
┌─────────────────────────────────────────────────────┐
│              ScheduledHandler.cdc                    │
│  executeDCA(ownerAddress, planId)                   │
│  ├── Validate plan ready                            │
│  ├── Build Flow Actions stack:                      │
│  │   Source (FLOW) → Swapper → Sink (Beaver)       │
│  ├── Execute swap via IncrementFi                   │
│  ├── Update plan accounting                         │
│  └── Schedule next execution                        │
└─────────────────────────────────────────────────────┘
                         │
                         │ Uses
                         ↓
┌─────────────────────────────────────────────────────┐
│              DeFiMath.cdc                            │
│  ├── calculateMinOutWithSlippage()                  │
│  ├── updateWeightedAveragePriceFP128()              │
│  └── FP128 utilities                                │
└─────────────────────────────────────────────────────┘
```

### Key Concepts

#### 1. **DCA Plans** (`DCAPlan.cdc`)

Each plan is a resource that represents a recurring investment strategy:
- Amount per interval (e.g., 10 FLOW)
- Interval (e.g., 7 days)
- Slippage tolerance (e.g., 1%)
- Optional max executions
- Tracks: total invested, total acquired, weighted average price

#### 2. **DCA Controller** (`DCAController.cdc`)

One per user, stored in their account:
- Holds all user's DCA plans
- Manages vault capabilities (withdraw from source, deposit to target)
- Provides public interface for querying plans

#### 3. **Scheduled Handler** (`ScheduledHandler.cdc`)

The autonomous executor:
- Called by Flow's Scheduled Transaction system at interval
- Validates plan readiness
- Executes swap via Flow Actions + IncrementFi
- Updates plan state
- Reschedules next execution

#### 4. **DeFi Math** (`DeFiMath.cdc`)

High-precision financial calculations:
- **Slippage protection**: Calculate minimum acceptable output
- **Weighted average price**: Track DCA performance using FP128
- **Basis points**: 100 bps = 1%, 10000 bps = 100%

#### 5. **IncrementFi Integration** (`IncrementRoutes.cdc`)

Helper for IncrementFi Flow Actions connectors:
- Swap routes (FLOW → Beaver)
- Pool validation
- Connector addresses for testnet/mainnet

---

## 📦 Project Structure

```
dcatoken/
├── cadence/
│   ├── contracts/
│   │   ├── DCAController.cdc       # User's DCA management resource
│   │   ├── DCAPlan.cdc             # DCA plan resource definition
│   │   ├── DeFiMath.cdc            # Fixed-point math utilities
│   │   ├── ScheduledHandler.cdc    # Scheduled execution handler
│   │   └── IncrementRoutes.cdc     # IncrementFi connector helpers
│   ├── transactions/
│   │   ├── setup_controller.cdc    # Initialize controller
│   │   ├── create_plan.cdc         # Create new DCA plan
│   │   ├── pause_plan.cdc          # Pause active plan
│   │   ├── resume_plan.cdc         # Resume paused plan
│   │   └── execute_plan_manual.cdc # Manual execution (testing)
│   └── scripts/
│       ├── get_all_plans.cdc       # Query all plans
│       ├── get_plan_details.cdc    # Query specific plan
│       ├── get_active_plans.cdc    # Query active plans only
│       └── check_controller_configured.cdc
├── apps/
│   └── web/                        # Next.js frontend
│       ├── src/
│       │   ├── app/                # App Router pages
│       │   ├── components/         # React components
│       │   └── lib/
│       │       └── flow-config.ts  # FCL configuration
│       ├── package.json
│       └── tailwind.config.js
├── flow.json                       # Flow project configuration
├── CLAUDE.md                       # Project guidelines
└── README.md                       # This file
```

---

## 🚀 Getting Started

### Prerequisites

- **Flow CLI** (v1.0+): [Install Flow CLI](https://developers.flow.com/tools/flow-cli/install)
- **Node.js** (v18+): For frontend
- **Git**: For cloning the repo

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/dcatoken.git
cd dcatoken
```

### 2. Install Frontend Dependencies

```bash
cd apps/web
npm install
cd ../..
```

---

## 🧪 Running Locally (Emulator)

### Step 1: Start the Flow Emulator

In one terminal, start the Flow emulator:

```bash
flow emulator start
```

Keep this running. You should see:
```
INFO[0000] ⚙️   Using in-memory storage
INFO[0000] 📦  Starting HTTP server on port 8888
```

### Step 2: Deploy Contracts

In another terminal, deploy contracts to the emulator:

```bash
flow project deploy --network emulator
```

Expected output:
```
Deploying 5 contracts for accounts: emulator-account

DeFiMath -> 0xf8d6e0586b0a20c7
DCAPlan -> 0xf8d6e0586b0a20c7
DCAController -> 0xf8d6e0586b0a20c7
IncrementRoutes -> 0xf8d6e0586b0a20c7
ScheduledHandler -> 0xf8d6e0586b0a20c7

✅ All contracts deployed successfully
```

### Step 3: Initialize Your Controller

Run the setup transaction to create your DCA controller:

```bash
flow transactions send cadence/transactions/setup_controller.cdc \
  --network emulator \
  --signer emulator-account
```

Expected output:
```
Transaction ID: abc123...
Status: ✅ SEALED
Events:
  - DCAController.ControllerCreated
```

### Step 4: Create a DCA Plan

Create your first DCA plan:

```bash
flow transactions send cadence/transactions/create_plan.cdc \
  10.0 \
  7 \
  100 \
  nil \
  300 \
  --network emulator \
  --signer emulator-account
```

**Parameters:**
- `10.0` - Amount per interval (10 FLOW)
- `7` - Interval in days (weekly)
- `100` - Max slippage in bps (1%)
- `nil` - Max executions (unlimited)
- `300` - First execution delay in seconds (5 minutes)

Expected output:
```
Transaction ID: def456...
Status: ✅ SEALED
Events:
  - DCAPlan.PlanCreated
    planId: 1
    amountPerInterval: 10.0
```

### Step 5: Query Your Plans

Check your plans:

```bash
flow scripts execute cadence/scripts/get_all_plans.cdc 0xf8d6e0586b0a20c7 \
  --network emulator
```

Expected output:
```json
[
  {
    "id": 1,
    "sourceTokenType": "A.0ae53cb6e3f42a79.FlowToken.Vault",
    "targetTokenType": "A.0ae53cb6e3f42a79.FlowToken.Vault",
    "amountPerInterval": "10.00000000",
    "intervalSeconds": 604800,
    "maxSlippageBps": 100,
    "status": 0,
    "executionCount": 0,
    "totalSourceInvested": "0.00000000",
    "totalTargetAcquired": "0.00000000",
    "nextExecutionTime": "1234567890.00000000"
  }
]
```

### Step 6: Manually Execute Plan (Testing)

For testing, manually trigger execution:

```bash
flow transactions send cadence/transactions/execute_plan_manual.cdc \
  0xf8d6e0586b0a20c7 \
  1 \
  --network emulator \
  --signer emulator-account
```

Expected output:
```
Transaction ID: ghi789...
Status: ✅ SEALED
Events:
  - ScheduledHandler.HandlerExecutionStarted
  - DCAPlan.PlanExecuted
    amountIn: 10.0
    amountOut: 25.123
    newAvgPriceFP128: ...
  - ScheduledHandler.NextExecutionScheduled
```

### Step 7: View Updated Plan

Query plan details after execution:

```bash
flow scripts execute cadence/scripts/get_plan_details.cdc \
  0xf8d6e0586b0a20c7 \
  1 \
  --network emulator
```

You should see:
- `executionCount: 1`
- `totalSourceInvested: 10.0`
- `totalTargetAcquired: 25.123` (example)
- Updated `avgExecutionPriceDisplay`

---

## 🌐 Running the Frontend

### Start Development Server

```bash
cd apps/web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Features

- **Connect Wallet**: Uses FCL to connect to Flow wallet (emulator/testnet)
- **Dashboard**: View all your DCA plans
- **Create Plan**: Form to set up new DCA strategies
- **Plan Details**: Monitor execution history, average price, performance

### Configuration

Create `.env.local`:

```bash
cp .env.example .env.local
```

For emulator (default):
```
NEXT_PUBLIC_FLOW_NETWORK=emulator
```

For testnet:
```
NEXT_PUBLIC_FLOW_NETWORK=testnet
NEXT_PUBLIC_DCA_CONTROLLER_ADDRESS=0x...
NEXT_PUBLIC_DCA_PLAN_ADDRESS=0x...
# ... other addresses after deployment
```

---

## 🚢 Deploying to Testnet

### Prerequisites

1. **Testnet Account**: Create via [Flow Faucet](https://testnet-faucet.onflow.org/)
2. **Fund Account**: Get FLOW tokens from faucet
3. **Update flow.json**:

```json
{
  "accounts": {
    "testnet-account": {
      "address": "0xYOUR_TESTNET_ADDRESS",
      "key": "YOUR_PRIVATE_KEY"
    }
  }
}
```

### Deploy Contracts

```bash
flow project deploy --network testnet
```

### Update Frontend Config

In `apps/web/.env.local`:

```bash
NEXT_PUBLIC_FLOW_NETWORK=testnet
NEXT_PUBLIC_DCA_CONTROLLER_ADDRESS=0x... # from deploy output
NEXT_PUBLIC_DCA_PLAN_ADDRESS=0x...
NEXT_PUBLIC_DEFI_MATH_ADDRESS=0x...
NEXT_PUBLIC_SCHEDULED_HANDLER_ADDRESS=0x...
NEXT_PUBLIC_INCREMENT_ROUTES_ADDRESS=0x...
```

### Note: Scheduled Transactions on Testnet

Scheduled Transactions are available on Flow Testnet. However, integration with the `FlowTransactionScheduler` contract is still evolving. For production use:

1. Register your handler with the scheduler contract
2. Update `ScheduledHandler.cdc` to call `FlowTransactionScheduler.schedule()`
3. Monitor scheduled executions via Flow block explorer

For now, use manual execution for testing: `execute_plan_manual.cdc`.

---

## 📊 DeFi Math & Fixed-Point Arithmetic

### Why FP128?

Dollar Cost Averaging requires precise price tracking:
- **Problem**: UFix64 loses precision in repeated calculations
- **Solution**: 128-bit fixed-point (FP128) stores prices as integers scaled by 2^64

### Key Functions

#### 1. Calculate Minimum Output with Slippage

```cadence
DeFiMath.calculateMinOutWithSlippage(
  amountIn: 10.0,              // 10 FLOW
  expectedPriceFP128: ...,     // Expected: 1 FLOW = 2.5 Beaver
  slippageBps: 100             // 1% tolerance
)
// Returns: 24.75 Beaver minimum (2.5 * 10 * 0.99)
```

#### 2. Update Weighted Average Price

```cadence
DeFiMath.updateWeightedAveragePriceFP128(
  previousAvgPriceFP128: oldAvg,
  totalPreviousIn: 50.0,       // Previously invested 50 FLOW
  newAmountIn: 10.0,           // This execution: 10 FLOW
  newAmountOut: 25.0           // Received: 25 Beaver
)
// Returns: New weighted average in FP128
```

**Formula:**
```
newAvg = (prevAvg * totalPrevIn + executionPrice * newIn) / (totalPrevIn + newIn)
```

#### 3. Convert for Display

```cadence
DeFiMath.fp128ToUFix64(priceFP128: avgPrice)
// Converts FP128 to human-readable UFix64 for UI display
```

### Basis Points Reference

| bps | Percentage | Use Case |
|-----|-----------|----------|
| 10  | 0.1%      | Stablecoin swaps |
| 50  | 0.5%      | Low volatility pairs |
| 100 | 1%        | **Recommended for DCA** |
| 300 | 3%        | High volatility pairs |
| 500 | 5%        | Max recommended |

---

## 🔄 Flow Actions Integration

### What are Flow Actions?

Flow Actions are composable DeFi primitives from the Flow Actions framework:
- **Source**: Where tokens come from (e.g., withdraw from vault)
- **Sink**: Where tokens go (e.g., deposit to vault)
- **Swapper**: Token exchange (e.g., DEX swap)
- **PriceOracle**: Price feeds
- **Flasher**: Flash loans

### DCA Flow Actions Stack

```cadence
Source(FLOW vault)
  ↓ withdraw 10 FLOW
Swapper(IncrementFi)
  ↓ swap FLOW → Beaver
Sink(Beaver vault)
  ↓ deposit acquired Beaver
```

### IncrementFi Connectors

This project uses IncrementFi's official Flow Actions connectors:
- **SwapConnector**: Atomic swaps with slippage protection
- **PoolSource**: Withdraw from liquidity pools
- **PoolSink**: Deposit to liquidity pools
- **PoolRewardsSource**: Claim LP rewards

**Note**: The current implementation includes a swap simulator (`simulateSwap()`) in `ScheduledHandler.cdc`. To integrate real IncrementFi swaps:

1. Import IncrementFi connector contracts (see testnet addresses in `IncrementRoutes.cdc`)
2. Replace `simulateSwap()` with real swap connector calls
3. Update `IncrementRoutes.cdc` with actual pool addresses

---

## 🧪 Testing Guide

### Test Scenarios

#### 1. Basic Flow

✅ Setup controller
✅ Create plan
✅ Execute once
✅ Verify accounting

```bash
# Setup
flow transactions send cadence/transactions/setup_controller.cdc --network emulator --signer emulator-account

# Create plan
flow transactions send cadence/transactions/create_plan.cdc 5.0 1 100 3 60 --network emulator --signer emulator-account

# Execute
flow transactions send cadence/transactions/execute_plan_manual.cdc 0xf8d6e0586b0a20c7 1 --network emulator --signer emulator-account

# Query
flow scripts execute cadence/scripts/get_plan_details.cdc 0xf8d6e0586b0a20c7 1 --network emulator
```

#### 2. Pause/Resume

```bash
# Pause
flow transactions send cadence/transactions/pause_plan.cdc 1 --network emulator --signer emulator-account

# Resume
flow transactions send cadence/transactions/resume_plan.cdc 1 120 --network emulator --signer emulator-account
```

#### 3. Multiple Executions

Create plan with max 3 executions, execute 3 times, verify status becomes `Completed`.

#### 4. Insufficient Balance

Create plan with large amount, execute without enough FLOW, verify graceful failure.

---

## 📚 Contract Reference

### DCAController.cdc

- `createController()` - Factory function for new controller
- `setSourceVaultCapability()` - Configure source token capability
- `setTargetVaultCapability()` - Configure target token capability
- `addPlan()` - Add plan to controller
- `borrowPlan()` - Mutable reference to plan
- `getAllPlans()` - Query all plans
- `getActivePlans()` - Query active plans only

### DCAPlan.cdc

- `createPlan()` - Factory function for new plan
- `recordExecution()` - Update accounting after swap
- `scheduleNextExecution()` - Calculate next run time
- `pause()` - Pause active plan
- `resume()` - Resume paused plan
- `getDetails()` - Return plan details struct

### ScheduledHandler.cdc

- `executeDCA()` - Main handler called by scheduler
- `executeSwap()` - Build and run Flow Actions stack
- `simulateSwap()` - Mock swap (TODO: replace with IncrementFi)

### DeFiMath.cdc

- `calculateMinOutWithSlippage()` - Slippage protection
- `updateWeightedAveragePriceFP128()` - DCA price tracking
- `calculatePriceFP128()` - Convert amounts to FP128 price
- `fp128ToUFix64()` - Convert FP128 for display

---

## 🛠 Common Commands

### Emulator

```bash
# Start emulator
flow emulator start

# Deploy contracts
flow project deploy --network emulator

# Send transaction
flow transactions send <path> <args> --network emulator --signer emulator-account

# Execute script
flow scripts execute <path> <args> --network emulator
```

### Testnet

```bash
# Deploy to testnet
flow project deploy --network testnet

# Send transaction
flow transactions send <path> <args> --network testnet --signer testnet-account

# Execute script
flow scripts execute <path> <args> --network testnet
```

### Frontend

```bash
cd apps/web

# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build
npm run start
```

---

## 🔐 Security Considerations

### Smart Contract Security

- ✅ **No resource leaks**: All resources properly handled
- ✅ **Pre/post conditions**: Critical functions have assertions
- ✅ **Capability-based access**: Uses Flow's capability security model
- ✅ **Slippage protection**: Prevents unfavorable trades
- ✅ **No hardcoded keys**: Never commit private keys to repo

### User Security

- 🔒 **Private keys**: Store securely, never commit `.env` files
- 🔒 **Approve carefully**: Review transaction details before signing
- 🔒 **Slippage tolerance**: Don't set > 5% in production
- 🔒 **Test first**: Always test on emulator before mainnet

---

## 🌟 Next Steps

### For Learners

1. **Modify the pair**: Change from FLOW → Beaver to another pair
2. **Add UI features**: Create plan form, execution history table
3. **Integrate real swaps**: Replace `simulateSwap()` with IncrementFi
4. **Add more DeFi actions**: Integrate oracles, flashers, or yield sources

### For Developers

1. **Flow Actions deep dive**: Study the Flow Actions scaffold
2. **Scheduled Transactions**: Explore `FlowTransactionScheduler` integration
3. **Advanced DeFi math**: Implement APY calculations, impermanent loss tracking
4. **Multi-token support**: Extend to support any token pair

---

## 📖 Further Reading

### Official Flow Documentation

- [Cadence 1.0 Language Reference](https://developers.flow.com/cadence/language)
- [Flow Actions Framework](https://github.com/onflow/flow-actions)
- [Scheduled Transactions Guide](https://developers.flow.com/build/advanced-concepts/scheduled-transactions)
- [FCL Documentation](https://developers.flow.com/tools/clients/fcl-js)

### Example Projects

- **Scheduled Transactions Scaffold**: Official scaffold for scheduled transactions
- **Flow Actions Scaffold**: Official scaffold for Flow Actions
- **ChronoBond**: Example of scheduled DeFi operations
- **Fast Break Vaults**: Auto-compounding vault example
- **IncrementFi**: DEX with Flow Actions connectors

### Community

- [Flow Discord](https://discord.gg/flow)
- [Flow Forum](https://forum.onflow.org/)
- [Flow GitHub](https://github.com/onflow)

---

## 🤝 Contributing

This is an educational project. Contributions welcome!

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Add tests and documentation
5. Submit a pull request

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

Built with:
- **Flow Blockchain** - Cadence 1.0 and Forte features
- **IncrementFi** - DEX and Flow Actions connectors
- **Flow Team** - Official scaffolds and examples
- **Next.js + Tailwind** - Frontend stack

---

**Happy DCA investing on Flow! 🚀**
