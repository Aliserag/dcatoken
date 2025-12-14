# DCA Token - Dollar Cost Averaging on Flow

> Autonomous DCA execution using Flow Scheduled Transactions and EVM DEX integration

## Overview

**DCA Token** enables automated Dollar-Cost Averaging on the Flow blockchain. Users can set up recurring token swaps (e.g., WFLOW → USDF) that execute autonomously without manual intervention.

### Key Features

- **Fully Autonomous Execution** - Plans execute on schedule without user signatures
- **Gas Sponsored** - Service account pays all Cadence transaction fees
- **EVM DEX Integration** - Swaps via Uniswap V3 on Flow EVM
- **Dual Wallet Support** - Works with Flow Wallet (Cadence) and MetaMask (EVM)
- **Scheduled Transactions** - Leverages Flow's native scheduled transactions

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Creates DCA Plan                       │
│            "Swap 0.1 WFLOW → USDF every hour"                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   EVM Token Approval                             │
│   User approves WFLOW to DCA Service's shared COA address        │
│   (One-time approval, enables all future executions)            │
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
│   4. Update plan statistics (execution count, totals)           │
│   5. Reschedule next execution (autonomous loop)                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    (Repeats until complete)
```

## Architecture

### Smart Contracts

| Contract          | Network | Address              | Purpose                                    |
| ----------------- | ------- | -------------------- | ------------------------------------------ |
| `DCAServiceEVM`   | Mainnet | `0xca7ee55e4fc3251a` | Core DCA logic, plan management, EVM swaps |
| `DCAServiceEVM`   | Testnet | `0x4a22e2fce83584aa` | Testnet deployment                         |
| `DCAHandlerEVMV4` | Both    | Same as above        | Scheduled transaction handler              |

### EVM Integration

The service uses a **shared Cadence Owned Account (COA)** to interact with EVM:

- **Mainnet COA**: `0x000000000000000000000002623833e1789dbd4a`
- **Testnet COA**: `0x000000000000000000000002c058dc16c13e4e2f`

Users approve ERC-20 tokens to this COA, which then executes swaps on their behalf.

### Supported Tokens

| Token | Mainnet Address                              | Testnet Address                              |
| ----- | -------------------------------------------- | -------------------------------------------- |
| WFLOW | `0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e` | Same                                         |
| USDF  | `0x2aaBea2058b5aC2D339b163C6Ab6f2b6d53aabED` | `0xd7d43ab7b365f0d0789aE83F4385fA710FfdC98F` |
| USDC  | `0xF1815bd50389c46847f0Bda824eC8da914045D14` | `0xd431955D55a99EF69BEb96BA34718d0f9fBc91b1` |

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

# Install Flow dependencies
flow deps install

# Install frontend dependencies
npm install
```

### Environment Setup

Create a `.env` file (copy from `.env.example`):

```env
# Required: Private keys for transaction signing (hex format, no 0x prefix)
PRIVATE_KEY_TESTNET=your_testnet_private_key_here
PRIVATE_KEY_MAINNET=your_mainnet_private_key_here

# Network selection
NEXT_PUBLIC_FLOW_NETWORK=testnet
```

### Running the Frontend

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
dcatoken/
├── cadence/
│   ├── contracts/
│   │   ├── DCAServiceEVM.cdc         # Core service contract (mainnet)
│   │   ├── DCAServiceEVMTestnet.cdc  # Testnet variant
│   │   └── DCAHandlerEVMV4.cdc       # Scheduled transaction handler
│   ├── transactions/
│   │   ├── evm/                      # EVM-related transactions
│   │   │   ├── create_plan.cdc       # Create DCA plan
│   │   │   ├── schedule_plan_v4.cdc  # Schedule execution
│   │   │   ├── pause_plan.cdc        # Pause plan
│   │   │   └── resume_plan.cdc       # Resume plan
│   │   ├── cadence-user/             # Flow Wallet transactions
│   │   │   ├── setup_coa.cdc         # Setup COA for user
│   │   │   ├── wrap_flow.cdc         # Wrap FLOW to WFLOW
│   │   │   └── approve_dca.cdc       # Approve tokens to DCA service
│   │   └── admin/                    # Admin utilities
│   │       ├── add_key.cdc           # Add account key
│   │       └── revoke_key.cdc        # Revoke account key
│   └── scripts/
│       └── evm/                      # Query scripts
│           ├── get_plan.cdc          # Get single plan
│           ├── get_user_plans.cdc    # Get all user plans
│           ├── get_total_plans.cdc   # Get plan count
│           └── check_allowance.cdc   # Check ERC-20 allowance
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Main app page
│   │   └── api/relay/route.ts        # Backend relay API (gas sponsor)
│   ├── components/
│   │   └── dca/
│   │       ├── create-plan.tsx       # Plan creation form
│   │       ├── dashboard.tsx         # Plans dashboard
│   │       └── header.tsx            # App header with wallet
│   ├── config/
│   │   └── fcl-config.ts             # FCL configuration
│   ├── hooks/
│   │   └── use-transaction.ts        # Transaction hook
│   └── lib/
│       ├── cadence-transactions.ts   # Cadence templates
│       └── transaction-relay.ts      # Relay API client
├── tests/
│   ├── run-smoke-tests.sh            # Basic functionality tests
│   ├── run-edge-case-tests.sh        # Edge case tests
│   └── monitor-testnet.sh            # Testnet monitoring
├── flow.json                         # Flow project config
└── package.json                      # Node.js dependencies
```

## Deploying Your Own Instance

### 1. Generate Keys

```bash
flow keys generate
```

Save the private key securely. Never commit it to git.

### 2. Configure flow.json

Add your account to `flow.json`:

```json
{
  "accounts": {
    "your-deployer": {
      "address": "YOUR_ADDRESS",
      "key": {
        "type": "hex",
        "index": 0,
        "signatureAlgorithm": "ECDSA_P256",
        "hashAlgorithm": "SHA3_256",
        "privateKey": "${YOUR_PRIVATE_KEY_ENV_VAR}"
      }
    }
  },
  "deployments": {
    "testnet": {
      "your-deployer": ["DCAServiceEVM", "DCAHandlerEVMV4"]
    }
  }
}
```

### 3. Deploy Contracts

```bash
# Deploy to testnet
flow project deploy --network testnet

# Or to mainnet
flow project deploy --network mainnet
```

### 4. Update Frontend Config

Update `src/config/fcl-config.ts` with your deployed contract addresses.

## Testing

### Run Smoke Tests

```bash
# Set environment variables
export PRIVATE_KEY_TESTNET=your_key_here

# Run tests
./tests/run-smoke-tests.sh
```

### Run Edge Case Tests

```bash
./tests/run-edge-case-tests.sh
```

### Monitor Testnet Plans

```bash
# Single check
./tests/monitor-testnet.sh

# Continuous monitoring
./tests/monitor-testnet.sh --continuous 60
```

## API Reference

### Backend Relay API

The relay API (`/api/relay`) sponsors gas for user transactions:

```typescript
// Create a DCA plan
POST /api/relay
{
  "action": "createPlan",
  "params": {
    "userEVMAddress": "0x...",
    "sourceToken": "0x...",
    "targetToken": "0x...",
    "amountPerExecution": "100000000000000000", // wei
    "intervalSeconds": 3600,
    "slippageBps": 100,
    "maxExecutions": 10,
    "feeTier": 3000
  }
}

// Schedule a plan
POST /api/relay
{
  "action": "schedulePlan",
  "params": {
    "planId": 1,
    "delaySeconds": 60.0
  }
}
```

### Cadence Scripts

```bash
# Get total plans
flow scripts execute cadence/scripts/evm/get_total_plans.cdc --network testnet

# Get specific plan
flow scripts execute cadence/scripts/evm/get_plan.cdc 1 --network testnet

# Get user plans
flow scripts execute cadence/scripts/evm/get_user_plans.cdc "0x..." --network testnet

# Check allowance
flow scripts execute cadence/scripts/evm/check_allowance.cdc "0x..." "0x..." --network testnet
```

## Security Considerations

1. **Token Approvals**: Users should only approve the amount they intend to DCA.
2. **Slippage**: Configure appropriate slippage tolerance (default: 100 bps = 1%).
3. **Service Account**: The relay API's service account has access to execute transactions on behalf of users.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Resources

- [Flow Documentation](https://developers.flow.com)
- [Cadence Language Reference](https://cadence-lang.org)
- [Flow Scheduled Transactions](https://developers.flow.com/build/advanced-concepts/scheduled-transactions)
- [FCL Documentation](https://developers.flow.com/tools/clients/fcl-js)

## Support

- [GitHub Issues](https://github.com/Aliserag/dcatoken/issues)
- [Flow Discord](https://discord.gg/flow)

---

Built with Flow Scheduled Transactions and Cadence 1.0
