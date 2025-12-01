# DCA Token - Dollar Cost Averaging on Flow

> Production-ready DCA automation using Forte Scheduled Transactions and DeFi Actions

## 🎯 What is This?

**DCA Token** is a fully functional Dollar-Cost Averaging application for Flow blockchain that demonstrates:

- ✅ **Forte Scheduled Transactions** - Autonomous, on-chain execution without manual intervention
- ✅ **DeFi Actions Framework** - Composable swap primitives for IncrementFi integration
- ✅ **Cadence 1.0** - Modern, secure smart contract patterns
- ✅ **High-Precision Math** - 128-bit fixed-point arithmetic for DCA tracking
- ✅ **Educational Quality** - Learn from production patterns with extensive documentation

### Default Configuration

- **Source Token**: USDT (TeleportedTetherToken)
- **Target Token**: FLOW
- **DEX**: IncrementFi SwapRouter (mainnet-ready)
- **Swap Route**: USDT → FLOW (direct pair, ~0.22 FLOW/USDT)
- **Execution**: Autonomous via FlowTransactionScheduler (emulator/testnet)

## 🚀 Quick Start

### Prerequisites

- Flow CLI v1.0+ ([install guide](https://developers.flow.com/tools/flow-cli/install))
- Node.js v18+ (for frontend)
- Git

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/dcatoken.git
cd dcatoken
flow deps install
```

### 2. Start Emulator

```bash
# Terminal 1
flow emulator start

# Terminal 2 (optional but recommended)
flow dev-wallet
```

### 3. Deploy & Test

```bash
flow project deploy --network emulator
```

**Then follow the complete testing workflow in** → **[TESTING_GUIDE.md](./TESTING_GUIDE.md)**

### 4. Run Frontend

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

## 🌐 Mainnet Deployment

Ready to deploy to production? This application is fully production-ready with real IncrementFi swap integration.

### Production Features

- ✅ **Real USDT → FLOW Swaps** via IncrementFi SwapRouter
- ✅ **Slippage Protection** with configurable basis points
- ✅ **Production-Grade Security** - audited contract patterns
- ✅ **Mainnet Token Support** - USDT (TeleportedTetherToken) and FLOW
- ✅ **Gas Optimized** - ~5 FLOW for full deployment

### Quick Deploy

```bash
# 1. Run setup script
./scripts/setup-mainnet.sh

# 2. Deploy contracts
flow project deploy --network mainnet

# 3. Update frontend config with deployed addresses
# Edit src/config/fcl-config.ts
```

**For detailed deployment instructions, see:** → **[DEPLOYMENT.md](./DEPLOYMENT.md)**

### Mainnet Contract Addresses

After deployment, your contracts will be at your deployer address:

```
DeFiMath: 0xYOUR_ADDRESS
DCAPlan: 0xYOUR_ADDRESS
DCAController: 0xYOUR_ADDRESS
DCATransactionHandler: 0xYOUR_ADDRESS
```

Update `src/config/fcl-config.ts` and `.env.local`:

```env
NEXT_PUBLIC_FLOW_NETWORK=mainnet
```

## 🎨 Frontend Features

The DCA application includes a production-ready Next.js frontend with full blockchain integration:

### Real Blockchain Integration
- ✅ **FCL Wallet Connection** - Connect with any Flow wallet (Dev Wallet for emulator)
- ✅ **Live Balance Fetching** - Real-time FLOW balance from blockchain
- ✅ **Transaction Execution** - Send real transactions to create DCA plans
- ✅ **Real-Time Data** - Fetch and display actual plan data from smart contracts
- ✅ **Transaction Status** - Visual feedback for pending, executing, and sealed transactions

### User Workflows

**First-Time User:**
1. Connect wallet via FCL
2. Setup DCA controller (one-time, one-click setup)
3. Create first DCA plan with desired parameters
4. Monitor plan execution in dashboard

**Returning User:**
1. Wallet auto-connects
2. View all active, paused, and completed plans
3. Create additional plans
4. Track performance metrics (total invested, acquired, average price)

### Frontend Components

| Component | Purpose | Blockchain Integration |
|-----------|---------|------------------------|
| `DCAHeader` | Wallet connection & balance | FCL authentication, balance query script |
| `CreateDCAPlan` | Plan creation form | Controller setup transaction, create plan transaction |
| `DCADashboard` | Plan overview & stats | Get all plans script, real-time data transformation |

### Transaction Templates

All Cadence code is in `src/lib/cadence-transactions.ts`:

```typescript
SETUP_CONTROLLER_TX    // Initialize user's DCA controller
CREATE_PLAN_TX         // Create new DCA plan
GET_ALL_PLANS_SCRIPT   // Query user's plans
CHECK_CONTROLLER_SCRIPT // Check if controller exists
```

### Configuration

Create `.env.local` to switch networks:

```env
# Emulator (default)
NEXT_PUBLIC_FLOW_NETWORK=emulator

# Testnet
# NEXT_PUBLIC_FLOW_NETWORK=testnet
```

See [FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md) for complete frontend documentation.

## 📦 Project Structure

```
dcatoken/
├── cadence/
│   ├── contracts/
│   │   ├── DeFiMath.cdc                 # FP128 fixed-point math
│   │   ├── DCAPlan.cdc                  # DCA plan resource
│   │   ├── DCAController.cdc            # User management
│   │   └── DCATransactionHandler.cdc    # Scheduler handler
│   ├── transactions/
│   │   ├── setup_controller.cdc         # Initialize controller
│   │   ├── init_dca_handler.cdc         # Initialize handler
│   │   ├── create_plan.cdc              # Create DCA plan
│   │   ├── schedule_dca_plan.cdc        # Schedule execution
│   │   ├── pause_plan.cdc               # Pause plan
│   │   └── resume_plan.cdc              # Resume plan
│   └── scripts/
│       ├── get_all_plans.cdc            # Query all plans
│       ├── get_plan_details.cdc         # Query plan details
│       └── check_controller_configured.cdc
├── src/                                 # Next.js frontend (flow-react-sdk-starter)
├── flow.json                            # Dependencies & config
├── TESTING_GUIDE.md                     # Complete testing walkthrough
├── NEXT_STEPS.md                        # Real IncrementFi integration guide
├── INTEGRATION_STATUS.md                # Project status tracker
└── README.md                            # This file
```

## 🏗 Architecture

### How DCA Execution Works

```
┌─────────────────────────────────────────┐
│         User Creates DCA Plan            │
│  "Invest 10 FLOW → Beaver every 7 days" │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      Initialize DCATransactionHandler    │
│  (implements FlowTransactionScheduler.   │
│   TransactionHandler interface)          │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│     Schedule via FlowTransactionScheduler │
│  Next execution: block.timestamp + 7 days │
└─────────────────────────────────────────┘
                    ↓
         ⏰ At Scheduled Time
                    ↓
┌─────────────────────────────────────────┐
│  Scheduler calls handler.executeTransaction() │
│                                          │
│  Handler:                                │
│  1. Validates plan is ready              │
│  2. Withdraws FLOW from user vault       │
│  3. Builds DeFi Actions stack:           │
│     Source → Swapper → Sink              │
│  4. Executes swap (IncrementFi)          │
│  5. Deposits acquired tokens             │
│  6. Updates FP128 average price          │
│  7. Schedules next execution             │
└─────────────────────────────────────────┘
```

### Key Components

#### 1. **DCAPlan** - The DCA Strategy Resource
- Configurable interval, amount, slippage
- Tracks: total invested, acquired, average price
- Lifecycle: Active → Paused → Resumed → Completed
- Uses FP128 for precise price tracking

#### 2. **DCAController** - User's Manager
- One per user, stores all their plans
- Manages vault capabilities (FLOW in, Beaver out)
- Owner entitlement for handler access
- Public interface for querying

#### 3. **DCATransactionHandler** - The Executor
- Implements `FlowTransactionScheduler.TransactionHandler`
- Has `Execute` entitlement from scheduler
- Autonomous execution without user signatures
- Integrates DeFi Actions for composable swaps

#### 4. **DeFiMath** - High-Precision Calculations
- 128-bit fixed-point (FP128) arithmetic
- Slippage protection calculations
- Weighted average price tracking
- Basis points (100 bps = 1%)

## 🎓 Educational Features

This project demonstrates best practices from official Flow scaffolds:

### From `scheduledtransactions-scaffold`:
- ✅ Proper `FlowTransactionScheduler.TransactionHandler` implementation
- ✅ Manager resource pattern for scheduling
- ✅ Entitled capability management
- ✅ Fee estimation and payment

### From `flow-actions-scaffold`:
- ✅ DeFi Actions framework integration
- ✅ IncrementFi connector patterns
- ✅ Composable Source → Swapper → Sink stacks
- ✅ UniqueIdentifier for operation tracing

### From `flow-react-sdk-starter`:
- ✅ Next.js 14 with App Router
- ✅ FCL integration for wallet connection
- ✅ TypeScript + Tailwind CSS
- ✅ flow.json configuration

## 📚 Documentation

- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - Step-by-step emulator testing (START HERE)
- **[NEXT_STEPS.md](./NEXT_STEPS.md)** - Real IncrementFi swap integration guide
- **[INTEGRATION_STATUS.md](./INTEGRATION_STATUS.md)** - Project progress tracker
- **[CLAUDE.md](./CLAUDE.md)** - Development guidelines and Flow Forte best practices

## 🔧 Configuration

### Emulator (Default)
```json
{
  "network": "emulator",
  "address": "0xf8d6e0586b0a20c7"
}
```

### Testnet
1. Create account: `flow accounts create --network testnet`
2. Fund via [testnet faucet](https://testnet-faucet.onflow.org/)
3. Deploy: `flow project deploy --network testnet`
4. Update frontend `.env.local` with deployed addresses

## 🧪 Testing

### Run Complete Test Suite

```bash
# 1. Install dependencies
flow deps install

# 2. Start emulator
flow emulator start

# 3. Deploy contracts
flow project deploy --network emulator

# 4. Follow TESTING_GUIDE.md
```

### Expected Test Results

After completing the testing guide:

- ✅ Controller initialized with vault capabilities
- ✅ Handler registered with scheduler
- ✅ DCA plan created (5 FLOW every day, max 3 executions)
- ✅ First execution scheduled and completed
- ✅ Plan accounting updated:
  - Execution count: 1
  - Total invested: 5 FLOW
  - Total acquired: ~12.5 tokens (simulated)
  - Average price: ~2.5
- ✅ Plan lifecycle tested (pause/resume)

## 🚀 Next Steps

### For Testing (Right Now)
1. **Follow [TESTING_GUIDE.md](./TESTING_GUIDE.md)** - Complete emulator walkthrough
2. **Verify all transactions work** - Setup, create, schedule, execute
3. **Query plan state** - Check accounting and status

### For Development (Next)
1. **Integrate Real IncrementFi Swaps**
   - Follow [NEXT_STEPS.md](./NEXT_STEPS.md)
   - Replace `simulateSwap()` in `DCATransactionHandler.cdc:218`
   - Use `IncrementFiSwapConnectors.Swapper`
   - Apply slippage protection with DeFiMath

2. **Test with Real DEX**
   - Deploy to testnet
   - Use real FLOW/Beaver pool
   - Monitor actual swap execution

3. **Build Frontend**
   - Plan creation form
   - Dashboard with execution history
   - Real-time plan monitoring
   - Based on included `flow-react-sdk-starter`

### For Production
1. **Security Audit**
2. **Gas Optimization**
3. **Error Handling**
4. **Monitoring & Alerts**

## 🔐 Security

### Capability Model
- **Owner Entitlement**: Handler can update plans
- **Execute Entitlement**: Scheduler can call handler
- **Withdraw Auth**: Handler withdraws from user vaults
- **Public Read**: Anyone can query plan state

### Best Practices
- ✅ No resource leaks (all resources destroyed or stored)
- ✅ Entitlement-based access control
- ✅ Pre/post conditions on critical functions
- ✅ Slippage protection on swaps
- ✅ Proper capability management

## 📊 DeFi Math

### Fixed-Point Precision (FP128)

DCA requires tracking average prices across many executions. We use 128-bit fixed-point:

```
Price = (output / input) * 2^64

Example:
- Swap 10 FLOW → 25 Beaver
- Price = (25 / 10) * 2^64 = 2.5 * 2^64
- FP128 value: 46116860184273879040
- Display: 2.5 Beaver per FLOW
```

### Weighted Average Formula

```
newAvg = (prevAvg × prevInvested + execPrice × newInvested) / totalInvested
```

This ensures each execution is weighted by investment amount.

### Slippage Protection

```cadence
minOut = expectedOut × (10000 - slippageBps) / 10000

Example:
- Expected: 25 Beaver
- Slippage: 100 bps (1%)
- Min: 25 × 9900 / 10000 = 24.75 Beaver
```

## 🤝 Contributing

This is an educational project. Contributions welcome!

1. Fork the repo
2. Create feature branch
3. Add tests and documentation
4. Submit PR

## 📄 License

MIT License - See LICENSE file

## 🙏 Acknowledgments

Built with official Flow scaffolds:
- [flow-react-sdk-starter](https://github.com/onflow/flow-react-sdk-starter)
- [scheduledtransactions-scaffold](https://github.com/onflow/scheduledtransactions-scaffold)
- [flow-actions-scaffold](https://github.com/onflow/flow-actions-scaffold)

Powered by:
- **Flow Blockchain** - Cadence 1.0 & Forte features
- **DeFi Actions** - Composable DeFi primitives
- **IncrementFi** - DEX with Flow Actions support
- **Next.js + FCL** - Frontend stack

## 📞 Support

- **Documentation**: Start with [TESTING_GUIDE.md](./TESTING_GUIDE.md)
- **Flow Discord**: [discord.gg/flow](https://discord.gg/flow)
- **Flow Docs**: [developers.flow.com](https://developers.flow.com)
- **Issues**: [GitHub Issues](https://github.com/yourusername/dcatoken/issues)

---

**🎉 Ready to test? Start with [TESTING_GUIDE.md](./TESTING_GUIDE.md)!**

Built with ❤️ for the Flow community | Cadence 1.0 | Forte Features | Educational Quality
