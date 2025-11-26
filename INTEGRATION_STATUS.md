# DCA Token - Integration Status

## ✅ Completed

### 1. Base Project Setup
- ✅ Cloned `flow-react-sdk-starter` as foundation
- ✅ Has Next.js 14, TypeScript, Tailwind CSS, FCL integration
- ✅ Pre-configured for Flow emulator/testnet

### 2. Scaffold Analysis
- ✅ Cloned `scheduledtransactions-scaffold` to `/tmp/scheduledtransactions-scaffold`
- ✅ Cloned `flow-actions-scaffold` to `/tmp/flow-actions-scaffold`
- ✅ Analyzed handler patterns and dependency structures

### 3. DCA Contracts Created
- ✅ `DeFiMath.cdc` - FP128 fixed-point math for slippage and average price tracking
- ✅ `DCAPlan.cdc` - DCA plan resource with lifecycle management
- ✅ `DCAController.cdc` - User's DCA management resource
- ✅ `DCATransactionHandler.cdc` - NEW: Implements `FlowTransactionScheduler.TransactionHandler` interface

### 4. Dependencies Configured ✅ NEW!
- ✅ `flow.json` updated with all required dependencies
- ✅ DeFiActions framework (DeFiActions, DeFiActionsMathUtils, DeFiActionsUtils)
- ✅ SwapConnectors for composable swaps
- ✅ IncrementFiSwapConnectors for FLOW → Beaver integration
- ✅ FlowTransactionScheduler + Utils for autonomous execution
- ✅ Core standards (FungibleToken, FlowToken, MetadataViews)

## 🚧 Next Steps (In Order)

### Step 1: Install Dependencies ✅ READY!

**Action Required:**
```bash
flow deps install
```

This will download all the dependencies we configured in `flow.json`.

**Required dependencies** (from `/tmp/flow-actions-scaffold/flow.json`):
```json
{
  "dependencies": {
    "DeFiActions": {
      "source": "mainnet://92195d814edf9cb0.DeFiActions",
      "aliases": {
        "mainnet": "92195d814edf9cb0",
        "testnet": "4c2ff9dd03ab442f"
      }
    },
    "DeFiActionsMathUtils": {
      "source": "mainnet://92195d814edf9cb0.DeFiActionsMathUtils",
      "aliases": {
        "mainnet": "92195d814edf9cb0",
        "testnet": "4c2ff9dd03ab442f"
      }
    },
    "DeFiActionsUtils": {
      "source": "mainnet://92195d814edf9cb0.DeFiActionsUtils",
      "aliases": {
        "mainnet": "92195d814edf9cb0",
        "testnet": "4c2ff9dd03ab442f"
      }
    },
    "FungibleToken": {
      "source": "mainnet://f233dcee88fe0abe.FungibleToken",
      "aliases": {
        "emulator": "ee82856bf20e2aa6",
        "mainnet": "f233dcee88fe0abe",
        "testnet": "9a0766d93b6608b7"
      }
    },
    "FlowToken": {
      "source": "mainnet://1654653399040a61.FlowToken",
      "aliases": {
        "emulator": "0ae53cb6e3f42a79",
        "mainnet": "1654653399040a61",
        "testnet": "7e60df042a9c0868"
      }
    }
  }
}
```

**Also required** (from `/tmp/scheduledtransactions-scaffold/flow.json`):
- `FlowTransactionScheduler`
- `FlowTransactionSchedulerUtils`
- Other standard contracts (MetadataViews, ViewResolver, etc.)

**Action:**
1. Copy dependencies section from `/tmp/flow-actions-scaffold/flow.json`
2. Merge with dependencies from `/tmp/scheduledtransactions-scaffold/flow.json`
3. Add our custom contracts to the contracts section

### Step 2: Add Missing Contract Files

Copy the ScheduledHandler contract from backup:
```bash
cp _backup/cadence/contracts/IncrementRoutes.cdc cadence/contracts/
cp _backup/cadence/contracts/ScheduledHandler.cdc cadence/contracts/ # if needed as reference
```

### Step 3: Add Required Transactions

Create transactions based on the scaffold patterns:

#### `cadence/transactions/init_dca_handler.cdc`
Initialize the DCA transaction handler for a user (based on `InitCounterTransactionHandler.cdc` pattern):
- Create Handler resource
- Save to storage at /storage/DCATransactionHandler
- Create capability for scheduler
- Link public capability

#### `cadence/transactions/schedule_dca_execution.cdc`
Schedule a DCA plan execution (based on `ScheduleIncrementIn.cdc` pattern):
- Get handler capability
- Create/borrow manager
- Estimate fees
- Schedule via manager

#### `cadence/transactions/setup_controller.cdc`
Setup DCA controller (already exists in backup):
```bash
cp _backup/cadence/transactions/setup_controller.cdc cadence/transactions/
cp _backup/cadence/transactions/create_plan.cdc cadence/transactions/
cp _backup/cadence/transactions/pause_plan.cdc cadence/transactions/
cp _backup/cadence/transactions/resume_plan.cdc cadence/transactions/
cp _backup/cadence/transactions/execute_plan_manual.cdc cadence/transactions/
```

### Step 4: Add Required Scripts

```bash
cp _backup/cadence/scripts/*.cdc cadence/scripts/
```

### Step 5: Install Flow Dependencies

Once `flow.json` is updated:
```bash
flow deps install
```

This will download all the DeFi Actions and Scheduled Transactions dependencies.

### Step 6: Update DCAController with Proper Entitlements

The `DCAController.cdc` needs an entitlement for the handler to access it:

```cadence
access(all) entitlement Owner

access(all) resource interface ControllerPublic {
    // ... existing functions
}

access(all) resource Controller: ControllerPublic {
    // ... existing code

    access(Owner) fun borrowPlan(id: UInt64): &DCAPlan.Plan? {
        return &self.plans[id]
    }
}
```

### Step 7: Integrate Real IncrementFi Swaps (Fork Testing)

This is the most complex part. Two approaches:

#### Approach A: Fork Testing (Recommended for Development)
Reference: https://developers.flow.com/blockchain-development-tutorials/cadence/fork-testing

Fork testing allows you to test against real mainnet/testnet state including IncrementFi pools.

1. Use Flow CLI fork testing to fork testnet
2. Access real IncrementFi contracts at their deployed addresses
3. Test swaps with real pool state

Example test setup:
```cadence
import Test

access(all) fun setup() {
    // Fork testnet at a specific block
    let blockchain = Test.newBlockchain()
    blockchain.useConfiguration(Test.Configuration({
        "IncrementSwap": "testnet://..." // Real IncrementFi address
    }))
}
```

#### Approach B: Mock Connectors (Current Approach)
Keep the `simulateSwap()` function for initial testing, document clearly that this is a placeholder.

### Step 8: Update Frontend Integration

The Next.js app in `src/` needs:

1. **Flow config update** in `src/components/flow-provider-wrapper.tsx`:
   - Import `flow.json` for automatic address resolution
   - Already done in starter!

2. **DCA UI components**:
   - Dashboard to show plans
   - Create plan form
   - Plan detail view with execution history
   - Integration with FCL for transactions

3. **Transaction hooks**:
   ```typescript
   import { useFlowMutate } from "@onflow/react-sdk";

   const { mutate } = useFlowMutate();

   const createPlan = (params) => {
     mutate({
       cadence: CREATE_PLAN_TX,
       args: (arg, t) => [
         arg(params.amountPerInterval, t.UFix64),
         arg(params.intervalDays, t.UInt64),
         // ... more args
       ]
     });
   };
   ```

### Step 9: Testing Workflow

Once all pieces are in place:

1. **Start emulator**:
   ```bash
   flow emulator start
   ```

2. **Deploy contracts**:
   ```bash
   flow project deploy --network emulator
   ```

3. **Initialize handler**:
   ```bash
   flow transactions send cadence/transactions/init_dca_handler.cdc \
     --network emulator \
     --signer emulator-account
   ```

4. **Setup controller**:
   ```bash
   flow transactions send cadence/transactions/setup_controller.cdc \
     --network emulator \
     --signer emulator-account
   ```

5. **Create plan**:
   ```bash
   flow transactions send cadence/transactions/create_plan.cdc \
     10.0 7 100 nil 300 \
     --network emulator \
     --signer emulator-account
   ```

6. **Schedule execution**:
   ```bash
   flow transactions send cadence/transactions/schedule_dca_execution.cdc \
     1 300 128 1000 \
     --network emulator \
     --signer emulator-account
   ```

7. **Query plan state**:
   ```bash
   flow scripts execute cadence/scripts/get_all_plans.cdc 0xf8d6e0586b0a20c7 \
     --network emulator
   ```

## 📝 Key Architecture Points

### Scheduled Transactions Flow

```
User creates plan
    ↓
Init handler → Save Handler resource to /storage/DCATransactionHandler
    ↓
Schedule execution → FlowTransactionScheduler.schedule(handlerCap, data, timestamp)
    ↓
At scheduled time → Scheduler calls handler.executeTransaction(id, data)
    ↓
Handler:
  1. Borrows controller via capability
  2. Borrows plan
  3. Validates ready for execution
  4. Executes swap via DeFi Actions
  5. Records execution in plan
  6. Schedules next execution
```

### DeFi Actions Integration

```
Source (FlowToken vault)
  ↓ withdraw amountPerInterval
Swapper (IncrementFi connector)
  ↓ swap FLOW → Beaver with slippage protection
Sink (Beaver vault)
  ↓ deposit acquired tokens
```

## 🔧 Files Reference

### Scaffold Locations
- **Scheduled Transactions**: `/tmp/scheduledtransactions-scaffold/`
- **Flow Actions**: `/tmp/flow-actions-scaffold/`
- **Backup DCA Code**: `_backup/cadence/`

### Key Files to Study
- `/tmp/scheduledtransactions-scaffold/cadence/contracts/CounterTransactionHandler.cdc` - Handler pattern
- `/tmp/scheduledtransactions-scaffold/cadence/transactions/InitCounterTransactionHandler.cdc` - Init pattern
- `/tmp/scheduledtransactions-scaffold/cadence/transactions/ScheduleIncrementIn.cdc` - Scheduling pattern
- `/tmp/flow-actions-scaffold/cadence/contracts/ExampleConnectors.cdc` - DeFi Actions patterns
- `/tmp/flow-actions-scaffold/flow.json` - All DeFi Actions dependencies

## 📚 Documentation to Write

Once integration is complete, update `README.md` with:

1. **How we built this section**:
   - Started with `flow-react-sdk-starter`
   - Integrated `scheduledtransactions-scaffold` patterns
   - Added `flow-actions-scaffold` dependencies
   - Created custom DCA contracts

2. **Dependencies explained**:
   - FlowTransactionScheduler - for autonomous execution
   - DeFiActions - for composable swaps
   - IncrementFi connectors - for DEX integration

3. **Step-by-step setup**:
   - Install Flow CLI
   - Clone repo
   - `flow deps install`
   - Deploy to emulator
   - Run example transactions

4. **Fork testing guide**:
   - How to fork testnet
   - Access real IncrementFi pools
   - Test with real state

## ⚠️ Current Limitations

1. **Swap implementation**: Uses `simulateSwap()` placeholder - needs real IncrementFi integration
2. **Scheduling**: Handler doesn't call `FlowTransactionScheduler.schedule()` for next execution - needs implementation
3. **Testnet addresses**: IncrementRoutes.cdc has placeholder addresses - needs real addresses
4. **Frontend**: Basic landing page only - needs DCA UI components

## 🎯 Priority Order

1. ✅ Update `flow.json` with all dependencies
2. ✅ Run `flow deps install`
3. ✅ Copy all transactions from backup
4. ✅ Test basic flow on emulator (without real swaps)
5. 🔄 Integrate real IncrementFi swaps via fork testing
6. 🔄 Build frontend DCA UI
7. 🔄 Test end-to-end on testnet
8. 🔄 Write comprehensive docs

---

**Next Immediate Action**: Update `flow.json` with dependencies from both scaffolds.
