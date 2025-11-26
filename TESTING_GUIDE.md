# DCA Token - Complete Testing Guide

## 🎯 Overview

This guide walks you through testing the DCA Token application end-to-end on the Flow emulator.

**What we'll test:**
1. ✅ Controller setup
2. ✅ Handler initialization
3. ✅ Plan creation
4. ✅ Scheduled execution (simulated swaps for now)
5. ✅ Plan lifecycle (pause/resume)
6. ✅ Querying plan state

## 📋 Prerequisites

### Required Software
- **Flow CLI** (v1.0+)
  ```bash
  # macOS
  brew install flow-cli

  # Other platforms
  sh -ci "$(curl -fsSL https://raw.githubusercontent.com/onflow/flow-cli/master/install.sh)"
  ```

- **Node.js** (v18+) - For frontend (optional)

### Check Installation
```bash
flow version
# Should show v1.x.x or higher
```

## 🚀 Step-by-Step Testing

### Step 1: Install Dependencies

**IMPORTANT:** Run this first to download all DeFi Actions and Scheduled Transaction contracts.

```bash
cd /Users/serag/Documents/GitHub/dcatoken
flow deps install
```

**Expected output:**
```
Installing dependencies...
✓ DeFiActions installed
✓ IncrementFiSwapConnectors installed
✓ FlowTransactionScheduler installed
✓ FungibleToken installed
✓ FlowToken installed
... (more dependencies)
All dependencies installed successfully!
```

**Troubleshooting:**
- If this fails, ensure you have internet connectivity
- Try: `flow deps install --update`
- Check `flow.json` for syntax errors

### Step 2: Start Flow Emulator

Open **Terminal 1** and start the emulator:

```bash
flow emulator start
```

**Expected output:**
```
INFO[0000] ⚙️   Using in-memory storage
INFO[0000] 📦  Starting HTTP server on port 8888
INFO[0000] 🌱  Flow emulator running
```

**Keep this terminal open!**

### Step 3: Start Dev Wallet (Optional but Recommended)

Open **Terminal 2** and start the dev wallet:

```bash
flow dev-wallet
```

**Expected output:**
```
Dev wallet starting on http://localhost:8701
```

**Keep this terminal open!**

### Step 4: Deploy Contracts

Open **Terminal 3** for running commands:

```bash
flow project deploy --network emulator
```

**Expected output:**
```
Deploying 4 contracts for accounts: emulator-account

DeFiMath -> 0xf8d6e0586b0a20c7
DCAPlan -> 0xf8d6e0586b0a20c7
DCAController -> 0xf8d6e0586b0a20c7
DCATransactionHandler -> 0xf8d6e0586b0a20c7

✅ All contracts deployed successfully
```

**Troubleshooting:**
- If contracts fail to deploy, check for import errors
- Ensure `flow deps install` was run successfully
- Check emulator is running in Terminal 1

### Step 5: Setup DCA Controller

Initialize the controller for the emulator account:

```bash
flow transactions send cadence/transactions/setup_controller.cdc \
  --network emulator \
  --signer emulator-account
```

**Expected output:**
```
Transaction ID: abc123def456...
Status: ✅ SEALED

Logs:
  - "DCA Controller created successfully"
  - "Source vault capability configured for FLOW"
  - "Target vault capability configured (using FLOW for testing)"
  - "DCA Controller setup complete"
```

**Verify:**
```bash
flow scripts execute cadence/scripts/check_controller_configured.cdc \
  0xf8d6e0586b0a20c7 \
  --network emulator
```

**Expected:**
```json
{
  "exists": true,
  "configured": true,
  "planCount": 0
}
```

### Step 6: Initialize DCA Handler

Create the transaction handler that the scheduler will call:

```bash
flow transactions send cadence/transactions/init_dca_handler.cdc \
  --network emulator \
  --signer emulator-account
```

**Expected output:**
```
Transaction ID: def456ghi789...
Status: ✅ SEALED

Logs:
  - "DCA Handler created and saved to storage"
  - "Entitled handler capability created for scheduler"
  - "Public handler capability published"
  - "DCA Transaction Handler initialization complete"
  - "Ready to schedule DCA plan executions"
```

### Step 7: Create a DCA Plan

Create your first DCA plan:

```bash
flow transactions send cadence/transactions/create_plan.cdc \
  5.0 \
  1 \
  100 \
  3 \
  60 \
  --network emulator \
  --signer emulator-account
```

**Parameters explained:**
- `5.0` - Amount per interval (5 FLOW)
- `1` - Interval in days (daily)
- `100` - Max slippage (1% = 100 basis points)
- `3` - Max executions (will run 3 times then complete)
- `60` - First execution delay (60 seconds from now)

**Expected output:**
```
Transaction ID: ghi789jkl012...
Status: ✅ SEALED

Events:
  - DCAPlan.PlanCreated
    planId: 1
    amountPerInterval: 5.0
    ...

Logs:
  - "Created DCA Plan with ID: 1"
  - "First execution scheduled for: 1234567920.00000000"
  - "Interval: 1 days (86400 seconds)"
  - "Amount per interval: 5.0 FLOW"
  - "Max slippage: 100 bps (1.0%)"
  - "Max executions: 3"
  - "Plan added to controller successfully"
```

**Verify:**
```bash
flow scripts execute cadence/scripts/get_all_plans.cdc \
  0xf8d6e0586b0a20c7 \
  --network emulator
```

**Expected:**
```json
[
  {
    "id": 1,
    "sourceTokenType": "A.0ae53cb6e3f42a79.FlowToken.Vault",
    "targetTokenType": "A.0ae53cb6e3f42a79.FlowToken.Vault",
    "amountPerInterval": "5.00000000",
    "intervalSeconds": 86400,
    "maxSlippageBps": 100,
    "maxExecutions": 3,
    "status": 0,
    "nextExecutionTime": "1234567920.00000000",
    "executionCount": 0,
    "totalSourceInvested": "0.00000000",
    "totalTargetAcquired": "0.00000000",
    "avgExecutionPriceFP128": "0",
    "avgExecutionPriceDisplay": "0.00000000",
    "createdAt": "1234567860.00000000",
    "lastExecutedAt": null
  }
]
```

### Step 8: Schedule Execution

Schedule the first execution via FlowTransactionScheduler:

```bash
flow transactions send cadence/transactions/schedule_dca_plan.cdc \
  1 \
  60 \
  128 \
  1000 \
  --network emulator \
  --signer emulator-account
```

**Parameters:**
- `1` - Plan ID
- `60` - Delay in seconds (60 = 1 minute)
- `128` - Priority (0=High, 1=Medium, 2=Low, 128=Medium)
- `1000` - Execution effort (gas limit)

**Expected output:**
```
Transaction ID: jkl012mno345...
Status: ✅ SEALED

Logs:
  - "Scheduling DCA plan 1 for execution at 1234567920.00000000"
  - "Priority: 128 (1)"
  - "Creating new scheduler manager"
  - "Estimated fee: 0.00100000 FLOW"
  - "✅ Scheduled transaction ID: 1"
  - "   Plan ID: 1"
  - "   Execution time: 1234567920.00000000"
  - "   Block timestamp now: 1234567860.00000000"
```

### Step 9: Wait for Execution

**The scheduled transaction will execute automatically after 60 seconds.**

Monitor the plan state:

```bash
# Check every 10 seconds
flow scripts execute cadence/scripts/get_plan_details.cdc \
  0xf8d6e0586b0a20c7 \
  1 \
  --network emulator
```

**After execution, you should see:**
```json
{
  "id": 1,
  "executionCount": 1,
  "totalSourceInvested": "5.00000000",
  "totalTargetAcquired": "12.50000000",
  "avgExecutionPriceDisplay": "2.50000000",
  "lastExecutedAt": "1234567920.00000000",
  ...
}
```

**Check emulator logs (Terminal 1) for:**
```
INFO[...] 📝 Transaction executed
INFO[...] Events:
  - DCATransactionHandler.HandlerExecutionStarted
  - DCAPlan.PlanExecuted
  - DCATransactionHandler.HandlerExecutionCompleted
```

### Step 10: Test Plan Lifecycle

#### Pause the plan:
```bash
flow transactions send cadence/transactions/pause_plan.cdc \
  1 \
  --network emulator \
  --signer emulator-account
```

**Verify status changed:**
```bash
flow scripts execute cadence/scripts/get_plan_details.cdc \
  0xf8d6e0586b0a20c7 \
  1 \
  --network emulator
```

**Should show:**
```json
{
  "status": 1,  // 1 = Paused
  "nextExecutionTime": null
}
```

#### Resume the plan:
```bash
flow transactions send cadence/transactions/resume_plan.cdc \
  1 \
  120 \
  --network emulator \
  --signer emulator-account
```

**Verify status changed back:**
```json
{
  "status": 0,  // 0 = Active
  "nextExecutionTime": "..."  // 120 seconds from now
}
```

## 📊 Understanding the Results

### Plan Status Codes
- `0` - Active (will execute)
- `1` - Paused (manual pause)
- `2` - Completed (reached max executions)
- `3` - Cancelled (manually cancelled)

### Accounting Fields
- **totalSourceInvested**: Total FLOW invested across all executions
- **totalTargetAcquired**: Total tokens received (currently simulated)
- **avgExecutionPriceDisplay**: Weighted average price (FP128 converted to display)
- **executionCount**: Number of times plan has executed

### FP128 Price Tracking
The `avgExecutionPriceFP128` field uses 128-bit fixed-point math for high precision:
- Tracks weighted average across all executions
- Prevents rounding errors in DCA calculations
- Convert to display format: `avgExecutionPriceDisplay`

## 🔍 Troubleshooting

### "Controller not found"
- Run `setup_controller.cdc` first
- Check controller exists: `check_controller_configured.cdc`

### "Handler not found"
- Run `init_dca_handler.cdc` first
- Verify handler is initialized

### "Insufficient balance"
- Emulator account starts with 1000 FLOW
- Check balance: `flow accounts get 0xf8d6e0586b0a20c7 --network emulator`

### Scheduled execution not happening
- Check emulator is running in Terminal 1
- Verify scheduler fees were paid
- Look for error events in emulator logs
- Note: Emulator must be actively running for scheduled transactions

### "Invalid capability"
- Ensure controller is fully configured
- Check vault capabilities are set correctly

## 🎯 Expected Test Results

After completing all steps:

1. ✅ Controller created and configured
2. ✅ Handler initialized with proper entitlements
3. ✅ Plan created with:
   - 5 FLOW per execution
   - Daily interval
   - Max 3 executions
4. ✅ First execution scheduled and completed
5. ✅ Plan shows:
   - Execution count: 1
   - Total invested: 5 FLOW
   - Total acquired: ~12.5 tokens (simulated 2.5x price)
   - Average price: ~2.5
6. ✅ Plan can be paused/resumed
7. ✅ Subsequent executions auto-schedule

## 🚀 Next Steps

### For Development:
1. **Integrate Real IncrementFi Swaps**
   - Update `DCATransactionHandler.executeSwap()`
   - Replace `simulateSwap()` with `IncrementFiSwapConnectors.Swapper`
   - See `NEXT_STEPS.md` for code examples

2. **Test on Testnet**
   - Deploy to testnet
   - Use real FLOW and Beaver tokens
   - Test with actual DEX pools

3. **Build Frontend**
   - React UI for plan creation
   - Dashboard for monitoring
   - Execution history

### For Production:
1. **Security Audit**
   - Review capability patterns
   - Test edge cases
   - Audit math calculations

2. **Gas Optimization**
   - Profile transaction costs
   - Optimize storage usage
   - Batch operations where possible

3. **Monitoring**
   - Track execution success rate
   - Monitor slippage
   - Alert on failures

## 📚 Additional Resources

- **Flow Docs**: https://developers.flow.com
- **DeFi Actions**: https://github.com/onflow/FlowActions
- **Scheduled Transactions**: https://developers.flow.com/build/advanced-concepts/scheduled-transactions
- **IncrementFi**: https://www.increment.fi

---

**🎉 You've completed the DCA Token testing workflow!**

The system now demonstrates:
- ✅ Autonomous scheduled execution
- ✅ DeFi math with FP128 precision
- ✅ Plan lifecycle management
- ✅ Proper capability security
- ✅ Ready for real IncrementFi integration

Next: Follow `NEXT_STEPS.md` to integrate real swaps!
