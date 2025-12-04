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

**🎉 Multiple Versions Available!**

This application offers three deployment options:

### V3 - EVM DEX Integration (Latest)

**✨ NEW: FLOW → USDF swaps on Flow EVM DEXes (FlowSwap V3 / PunchSwap V2)**

Features:
- ✅ **COA-Based Execution** - No MetaMask needed, fully autonomous
- ✅ **EVM DEX Support** - Swap on FlowSwap V3 with automatic PunchSwap V2 fallback
- ✅ **FLOW → USDF** - Uses Flow native stablecoin
- ✅ **User-Configured Slippage** - Per-plan slippage tolerance
- ✅ **Automatic FLOW ↔ WFLOW** - Via FlowEVMBridge
- ✅ **Precision Handling** - Automatic rounding to 10^10 wei for Cadence compatibility

**Status**: ✅ Contracts complete, transactions ready, frontend integration documented

See [EVM_INTEGRATION_SUMMARY.md](./EVM_INTEGRATION_SUMMARY.md) for complete technical details.

**V3 Contracts** (Not yet deployed):
```
DCAPlanV3                   (pending mainnet deployment)
DCAControllerV3             (pending mainnet deployment)
DCATransactionHandlerV3     (pending mainnet deployment)
UniswapV3SwapperConnector   (pending mainnet deployment)
EVMTokenRegistry            (pending mainnet deployment)
DeFiActions                 (pending mainnet deployment)
```

**Prerequisites**: Users must setup COA (Cadence-Owned Account) before using V3.

See [V3_FRONTEND_INTEGRATION_GUIDE.md](./V3_FRONTEND_INTEGRATION_GUIDE.md) for frontend integration steps.

---

### V2 - IncrementFi Integration (Production)

**🎉 V2 contracts are LIVE on Flow Mainnet with autonomous scheduling!**

Features:
- ✅ **Autonomous DCA Execution** via FlowTransactionScheduler
- ✅ **Real USDT ↔ FLOW Swaps** via IncrementFi SwapRouter
- ✅ **Manager Pattern** for recursive scheduling (no manual intervention)
- ✅ **Slippage Protection** with configurable basis points
- ✅ **Production-Grade Security** - Cadence 1.0 best practices

**Deployed Contract Addresses (V2)**

**Mainnet Deployment**: `0xca7ee55e4fc3251a`

```
DeFiMath:                   0xca7ee55e4fc3251a (shared utility)
DCAPlanV2:                  0xca7ee55e4fc3251a
DCAControllerV2:            0xca7ee55e4fc3251a
DCATransactionHandlerV2:    0xca7ee55e4fc3251a

FlowTransactionScheduler:   0xe467b9dd11fa00df (Flow core contract)
FlowTransactionSchedulerUtils: 0xe467b9dd11fa00df (Flow core contract)
```

**Autonomous Scheduling with Manager Pattern:**
- Plans reschedule themselves after each execution
- Manager capability passed in transaction data
- Uses `FlowTransactionSchedulerUtils.Manager.scheduleByHandler()`
- No user intervention required for recurring DCA

---

### V1 - Original (Emulator/Testnet)

**Status**: Maintained for emulator/testnet compatibility

Features:
- ✅ Basic DCA functionality
- ✅ Manual scheduling (simpler pattern)
- ✅ Perfect for learning and testing

**Why Multiple Versions?**
- **V1**: Emulator/testnet - simpler pattern for education
- **V2**: Mainnet - autonomous scheduling via Manager pattern
- **V3**: Latest - EVM DEX support with COA-based execution

### Quick Deploy (For Your Own Instance)

```bash
# 1. Configure your mainnet account in flow.json
# 2. Deploy V2 contracts
flow project deploy --network mainnet

# 3. Frontend automatically uses V2 on mainnet
# Set in .env.local:
NEXT_PUBLIC_FLOW_NETWORK=mainnet
```

**Frontend auto-detects network and uses:**
- Mainnet → V2 contracts (autonomous scheduling)
- Emulator/Testnet → V1 contracts (manual scheduling)

All handled automatically via FCL configuration!

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
│   │   ├── DeFiMath.cdc                        # FP128 fixed-point math (shared)
│   │   ├── DCAPlan.cdc                         # V1: DCA plan resource (emulator/testnet)
│   │   ├── DCAPlanV2.cdc                       # V2: Plan with Manager pattern (mainnet)
│   │   ├── DCAPlanV3.cdc                       # V3: Plan for EVM DEXes ⚡ NEW
│   │   ├── DCAController.cdc                   # V1: User management
│   │   ├── DCAControllerV2.cdc                 # V2: Controller for mainnet
│   │   ├── DCAControllerV3.cdc                 # V3: Controller with COA capability ⚡ NEW
│   │   ├── DCATransactionHandler.cdc           # V1: Scheduler handler
│   │   ├── DCATransactionHandlerV2.cdc         # V2: Autonomous scheduling (mainnet)
│   │   ├── DCATransactionHandlerV3.cdc         # V3: EVM swap integration ⚡ NEW
│   │   ├── UniswapV3SwapperConnector.cdc       # V3: Production EVM swapper ⚡ NEW
│   │   ├── EVMTokenRegistry.cdc                # V3: Cadence ↔ EVM token mappings ⚡ NEW
│   │   └── interfaces/
│   │       └── DeFiActions.cdc                 # V3: Composable DeFi interfaces ⚡ NEW
│   ├── transactions/
│   │   ├── v1/                                 # V1 transactions (emulator)
│   │   │   ├── setup_controller.cdc
│   │   │   ├── create_plan.cdc
│   │   │   └── ...
│   │   ├── v2/                                 # V2 transactions (mainnet)
│   │   │   ├── setup_controller_v2.cdc
│   │   │   ├── create_fund_activate_plan_v2.cdc
│   │   │   └── ...
│   │   └── v3/                                 # V3 transactions (EVM DEXes) ⚡ NEW
│   │       ├── setup_coa.cdc                   # COA setup for EVM
│   │       ├── setup_controller_v3.cdc         # Controller with COA capability
│   │       ├── init_dca_handler_v3.cdc         # Handler initialization
│   │       └── create_fund_activate_plan_v3.cdc # All-in-one plan creation
│   └── scripts/
│       ├── v1/                                 # V1 scripts
│       │   ├── get_all_plans.cdc
│       │   └── ...
│       ├── v2/                                 # V2 scripts
│       │   ├── get_all_plans.cdc
│       │   └── ...
│       └── v3/                                 # V3 scripts ⚡ NEW
│           ├── get_all_plans.cdc               # Query V3 plans
│           ├── check_coa_setup.cdc             # Verify COA configuration
│           └── check_controller_setup.cdc      # Verify controller + COA
├── src/                                        # Next.js frontend
│   ├── config/
│   │   └── fcl-config.ts                       # Network-aware FCL config
│   ├── lib/
│   │   └── cadence-transactions.ts             # All V1/V2/V3 templates ⚡ UPDATED
│   └── components/
│       └── dca/
│           ├── create-plan.tsx                 # Plan creation UI
│           └── dashboard.tsx                   # Plans dashboard
├── flow.json                                   # Multi-version deployment config
├── TESTING_GUIDE.md                            # Complete testing walkthrough
├── DEPLOYMENT.md                               # Mainnet deployment guide
├── EVM_INTEGRATION_SUMMARY.md                  # V3 technical architecture ⚡ NEW
├── V3_FRONTEND_INTEGRATION_GUIDE.md            # V3 frontend integration ⚡ NEW
└── README.md                                   # This file (updated)
```

## 🏗 Architecture

### How DCA Execution Works

```
┌─────────────────────────────────────────┐
│         User Creates DCA Plan            │
│   "Invest 10 USDT → FLOW every 7 days"  │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      Initialize DCATransactionHandler    │
│  (implements FlowTransactionScheduler.   │
│   TransactionHandler interface)          │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│     Schedule via Manager.schedule()      │
│  Pass ScheduleConfig with Manager cap    │
│  Next execution: block.timestamp + 7d   │
└─────────────────────────────────────────┘
                    ↓
         ⏰ At Scheduled Time
                    ↓
┌─────────────────────────────────────────┐
│  Scheduler calls handler.executeTransaction() │
│                                          │
│  Handler (V2 with autonomous rescheduling): │
│  1. Extract ScheduleConfig from data     │
│  2. Validate plan is ready               │
│  3. Withdraw USDT from user vault        │
│  4. Execute swap via IncrementFi:        │
│     SwapRouter.swapExactTokensForTokens()│
│  5. Deposit FLOW to target vault         │
│  6. Update FP128 average price           │
│  7. Record execution in plan             │
│  8. Borrow Manager from ScheduleConfig   │
│  9. Call Manager.scheduleByHandler()     │
│     → Autonomously schedules next run!   │
└─────────────────────────────────────────┘
                    ↓
              (Repeats autonomously)
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
- **V1** (emulator/testnet): Basic handler implementation
- **V2** (mainnet): Autonomous rescheduling with Manager pattern
  - Implements `FlowTransactionScheduler.TransactionHandler`
  - Has `Execute` entitlement from scheduler
  - Receives `ScheduleConfig` with Manager capability in transaction data
  - Calls `Manager.scheduleByHandler()` after each execution
  - Autonomous execution without user signatures
- Uses IncrementFi `SwapRouter` for real swaps (mainnet)
- Slippage protection calculated with DeFiMath

#### 4. **DeFiMath** - High-Precision Calculations
- 128-bit fixed-point (FP128) arithmetic
- Slippage protection calculations
- Weighted average price tracking
- Basis points (100 bps = 1%)

## 🎓 Educational Features

This project demonstrates best practices from official Flow scaffolds:

### From `scheduledtransactions-scaffold`:
- ✅ Proper `FlowTransactionScheduler.TransactionHandler` implementation
- ✅ **Manager resource pattern for autonomous scheduling** (V2)
  - `FlowTransactionSchedulerUtils.Manager` for recursive scheduling
  - `ScheduleConfig` struct with Manager capability
  - `scheduleByHandler()` for self-rescheduling handlers
- ✅ Entitled capability management (`Execute`, `Owner`)
- ✅ Fee estimation and payment (`estimate()` returns struct)
- ✅ Transaction data passing (structs in `data` parameter)

### From IncrementFi Production Integration:
- ✅ **Real mainnet swaps** via `SwapRouter.swapExactTokensForTokens()`
- ✅ Token path configuration (`USDT` → `FLOW`)
- ✅ Slippage protection with `amountOutMin`
- ✅ Production DEX integration (not just connectors)

### From `flow-react-sdk-starter`:
- ✅ Next.js 14 with App Router
- ✅ FCL integration for wallet connection
- ✅ Network-aware configuration (auto V2 on mainnet)
- ✅ TypeScript + Tailwind CSS
- ✅ flow.json with V2 deployments

## 📚 Documentation

### Getting Started
- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - Step-by-step emulator testing (START HERE)
- **[FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md)** - Frontend integration and usage

### EVM Integration (V3) ⚡ NEW
- **[EVM_INTEGRATION_SUMMARY.md](./EVM_INTEGRATION_SUMMARY.md)** - Complete V3 architecture and implementation
- **[V3_FRONTEND_INTEGRATION_GUIDE.md](./V3_FRONTEND_INTEGRATION_GUIDE.md)** - Frontend integration steps for V3

### Development
- **[NEXT_STEPS.md](./NEXT_STEPS.md)** - Real IncrementFi swap integration guide (V2)
- **[INTEGRATION_STATUS.md](./INTEGRATION_STATUS.md)** - Project progress tracker
- **[CLAUDE.md](./CLAUDE.md)** - Development guidelines and Flow Forte best practices
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Mainnet deployment guide

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
