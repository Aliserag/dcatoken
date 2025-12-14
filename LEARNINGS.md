# DCA Token Project - Learnings & Context

## Current Architecture (Verified Working)

### How DCA Execution Works

```
User's COA (WFLOW) → DCAServiceEVM's Shared COA → UniswapV3 Swap → Back to User's COA (USDF)
```

1. **Service has a shared COA** embedded in `DCAServiceEVM.cdc`
2. **User approves** the shared COA to spend their WFLOW (ERC-20 approve)
3. **Scheduled transaction** pulls WFLOW via `transferFrom`, swaps via UniswapV3, sends USDF back
4. **No bridging needed** - everything stays in EVM land

### Key Addresses (Mainnet)

| Name | Address |
|------|---------|
| DCAServiceEVM | `0xca7ee55e4fc3251a` |
| Shared COA (spender) | `0x000000000000000000000002623833e1789dbd4a` |
| UniswapV3 Router | `0xeEDC6Ff75e1b10B903D9013c358e446a73d35341` |
| WFLOW | `0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e` |
| USDF | `0x2aaBea2058b5aC2D339b163C6Ab6f2b6d53aabED` |

---

## User Flows

### Metamask Users
1. Connect Metamask (Flow EVM chain 747)
2. Approve shared COA to spend WFLOW
3. Create DCA plan → scheduled executions happen automatically

### Flow Wallet Users
1. Connect Flow Wallet
2. Setup COA (if not exists) - creates EVM account
3. Deposit FLOW into COA → automatically wraps to WFLOW
4. Approve shared COA to spend WFLOW
5. Create DCA plan → scheduled executions happen automatically

---

## Key Technical Learnings

### DeFi Actions vs EVM-Only Pattern

**DeFi Actions** (with bridging):
- Designed for Cadence-native tokens
- Uses `coa.depositTokens()` and `coa.withdrawTokens()` for bridging
- Good for: Pure Cadence flows, composability across protocols

**EVM-Only** (our current approach):
- Tokens stay in EVM (user COA → shared COA → swap → user COA)
- Uses direct ERC-20 `transferFrom` and `transfer`
- Good for: Metamask users, EVM-native tokens, no bridging overhead

**Decision**: We use EVM-only pattern because:
- Both wallet types ultimately have WFLOW in their COA
- No need to bridge to Cadence just to bridge back
- Simpler, less gas overhead

### FlowEVMBridge Auto-Wrapping

When a Flow Wallet user deposits FLOW into their COA:
1. FLOW goes into COA balance (native)
2. User calls `WFLOW.deposit()` which wraps the FLOW to WFLOW
3. Now user has WFLOW (ERC-20) in their COA

### UFix64 Formatting Gotcha

Cadence `UFix64` requires a decimal point. Always format amounts like:
- `"1.0"` not `"1"`
- `"0.5"` not `".5"`

```typescript
const formattedAmount = amount.includes('.') ? amount : `${amount}.0`;
```

### EVM.call() Not Available in Scripts

You cannot use `EVM.call()` as a static function in Cadence scripts. It requires a COA reference:
- In **transactions**: `coa.call(...)` works
- In **scripts**: No static `EVM.call()` available

For read-only EVM queries in scripts, alternatives:
- Use session state to track deposits
- Use the allowance check as a proxy for "user has funds"
- Future: Wait for improved EVM script support

### FCL onceSealed() statusCode Quirk

After `fcl.tx(txId).onceSealed()` resolves, the `statusCode` might be 0 instead of 4 (SEALED).
Trust that `onceSealed()` only resolves on success - check `errorMessage` for failures instead of `statusCode`.

### Fee Vault for Scheduled Transactions

- Scheduler needs FLOW to pay for future executions
- Fee vault at `/storage/DCAHandlerEVMV4FeeVault`
- Backend funds this when scheduling a plan
- **Each execution costs ~0.7 FLOW** (with `executionEffort: 3500`)
- We use 0.85 FLOW per execution (20% buffer) to be safe
- Fee calculation pattern (from reference project):
  ```cadence
  var feeAmount = (feeEstimate.flowFee ?? 0.01) * 1.05  // 5% buffer
  if feeAmount > 10.0 { feeAmount = 10.0 }              // cap at 10 FLOW
  ```
- executionEffort values:
  - Cadence-only swaps (IncrementFi): 400
  - EVM swaps (UniswapV3): 3500 (includes bridging overhead)

---

## Files Reference

### Contracts
- `cadence/contracts/DCAServiceEVM.cdc` - Main DCA service with shared COA
- `cadence/contracts/DCAHandlerEVMV4.cdc` - Scheduled transaction handler

### Frontend
- `src/components/dca/create-plan.tsx` - Create DCA plan UI
- `src/lib/cadence-transactions.ts` - Cadence transaction templates
- `src/lib/transaction-relay.ts` - Backend API calls for sponsored transactions
- `src/app/api/relay/route.ts` - Backend API that submits Cadence transactions

### Config
- `src/config/fcl-config.ts` - FCL configuration, token addresses
- `flow.json` - Flow CLI configuration

---

## Current Status

- [x] Contracts deployed and working on mainnet
- [x] Scheduled transactions working (FlowTransactionScheduler)
- [x] Backend API for sponsored transactions
- [x] Frontend for both Metamask and Flow Wallet
- [ ] End-to-end testing with real funds

---

## Pending Issues

1. **Plans 20-23**: Created but executions failed ("Failed to pull tokens") because user's COA had no WFLOW
2. **Frontend UX**: Need to clearly show deposit step before approval for Flow Wallet users

---

## Next Steps

1. Test complete Flow Wallet flow (deposit → approve → create)
2. Test complete Metamask flow (connect → approve → create)
3. Verify scheduled executions are working
