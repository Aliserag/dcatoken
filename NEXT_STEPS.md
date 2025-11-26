# DCA Token - Next Steps for Real IncrementFi Integration

## 🎯 Current Status

✅ **Completed:**
1. Project built on `flow-react-sdk-starter` foundation
2. All DCA contracts created and in place:
   - `DeFiMath.cdc` - High-precision math
   - `DCAPlan.cdc` - Plan resource
   - `DCAController.cdc` - User controller
   - `DCATransactionHandler.cdc` - Scheduler handler
3. `flow.json` configured with all dependencies
4. Ready to install dependencies and integrate real IncrementFi swaps

## 🚀 Immediate Next Actions

### 1. Install Flow Dependencies

**If Flow CLI is installed:**
```bash
flow deps install
```

This will download:
- DeFiActions framework
- IncrementFiSwapConnectors
- FlowTransactionScheduler
- All supporting contracts

**If Flow CLI is NOT installed:**
- Install from: https://developers.flow.com/tools/flow-cli/install
- macOS: `brew install flow-cli`
- Then run `flow deps install`

### 2. Update DCATransactionHandler with Real Swaps

The current `DCATransactionHandler.cdc:218` has a `simulateSwap()` placeholder.

**Replace with IncrementFi connector:**

```cadence
// Current (line 180-215):
access(self) fun executeSwap(...) {
    // ... existing code ...

    // TODO: Integrate real IncrementFi swap connector via DeFi Actions
    let amountOut = self.simulateSwap(amountIn: amountIn)
    let swappedTokens <- tokensToSwap  // Mock

    // ...
}

// New implementation:
import "IncrementFiSwapConnectors"
import "SwapConnectors"

access(self) fun executeSwap(...) {
    // ... existing validation ...

    // Withdraw tokens to swap
    let tokensToSwap <- sourceVault.withdraw(amount: amountIn)

    // Calculate minimum output with slippage protection
    let minOut = DeFiMath.calculateMinOutWithSlippage(
        amountIn: amountIn,
        expectedPriceFP128: planRef.avgExecutionPriceFP128 > 0
            ? planRef.avgExecutionPriceFP128
            : UInt128(46116860184273879040), // Default: ~2.5 Beaver per FLOW
        slippageBps: planRef.maxSlippageBps
    )

    // Create IncrementFi swapper
    // Note: You'll need to determine the correct pair ID for FLOW/Beaver
    let swapper = IncrementFiSwapConnectors.Swapper(
        tokenInType: Type<@FlowToken.Vault>(),
        tokenOutType: Type<@BeaverToken.Vault>(), // Update with real Beaver contract
        pairAddress: ..., // IncrementFi pair address for FLOW/Beaver
        uniqueID: DeFiActions.createUniqueIdentifier()
    )

    // Execute swap
    let swappedTokens <- swapper.swap(
        tokensIn: <-tokensToSwap,
        exactAmountOut: nil  // Use slippage-protected minimum
    )

    let amountOut = swappedTokens.balance

    // Deposit to target vault
    let targetVault = targetVaultCap.borrow() ?? panic("Could not borrow target vault")
    targetVault.deposit(from: <-swappedTokens)

    return ExecutionResult(success: true, amountIn: amountIn, amountOut: amountOut, errorMessage: nil)
}
```

### 3. Find IncrementFi FLOW/Beaver Pair

**Options:**

**A) Use Fork Testing (Recommended)**
- Fork testnet to access real IncrementFi state
- Query pair registry for FLOW/Beaver
- Test with real pool liquidity

```bash
# In Cadence test:
import Test
let blockchain = Test.newBlockchain()
blockchain.useConfiguration(Test.Configuration({
    "IncrementFi": "testnet://..."
}))
```

**B) Query Testnet Directly**
```cadence
// Script to find pair:
import IncrementFiSwapConnectors from 0x49bae091e5ea16b5

access(all) fun main(): [PairInfo] {
    return IncrementFiSwapConnectors.getAllPairs()
}
```

**C) Use Mock for Emulator**
- For emulator testing, continue with simulated swaps
- Document clearly this is educational/test mode

### 4. Create Required Transactions

Copy transactions from backup (already exist):
```bash
# These are in _backup repo but need to be brought forward:
cp _backup/cadence/transactions/setup_controller.cdc cadence/transactions/
cp _backup/cadence/transactions/create_plan.cdc cadence/transactions/
cp _backup/cadence/transactions/pause_plan.cdc cadence/transactions/
cp _backup/cadence/transactions/resume_plan.cdc cadence/transactions/
```

**Create new transactions based on scaffolds:**

#### `cadence/transactions/init_dca_handler.cdc`
Pattern from: `/tmp/scheduledtransactions-scaffold/cadence/transactions/InitCounterTransactionHandler.cdc`

```cadence
import "DCATransactionHandler"
import "DCAController"
import "FlowTransactionScheduler"

transaction() {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Get controller capability
        let controllerCap = signer.capabilities.storage
            .issue<auth(DCAController.Owner) &DCAController.Controller>(
                DCAController.ControllerStoragePath
            )

        // Create handler
        let handler <- DCATransactionHandler.createHandler(controllerCap: controllerCap)

        // Save to storage
        signer.storage.save(<-handler, to: /storage/DCATransactionHandler)

        // Create entitled capability for scheduler
        let handlerCap = signer.capabilities.storage
            .issue<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>(
                /storage/DCATransactionHandler
            )

        // Publish public capability
        signer.capabilities.publish(
            handlerCap,
            at: /public/DCATransactionHandler
        )

        log("DCA Handler initialized")
    }
}
```

#### `cadence/transactions/schedule_dca_plan.cdc`
Pattern from: `/tmp/scheduledtransactions-scaffold/cadence/transactions/ScheduleIncrementIn.cdc`

```cadence
import "FlowTransactionScheduler"
import "FlowTransactionSchedulerUtils"
import "FlowToken"
import "FungibleToken"

transaction(
    planId: UInt64,
    delaySeconds: UFix64,
    priority: UInt8,
    executionEffort: UInt64
) {
    prepare(signer: auth(BorrowValue, IssueStorageCapabilityController, SaveValue) &Account) {
        let future = getCurrentBlock().timestamp + delaySeconds

        // Get priority enum
        let pr = priority == 0
            ? FlowTransactionScheduler.Priority.High
            : priority == 1
                ? FlowTransactionScheduler.Priority.Medium
                : FlowTransactionScheduler.Priority.Low

        // Get handler capability
        let handlerCap = signer.capabilities.storage
            .getControllers(forPath: /storage/DCATransactionHandler)[0]
            .capability as! Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>

        // Create or borrow manager
        if signer.storage.borrow<&AnyResource>(from: FlowTransactionSchedulerUtils.managerStoragePath) == nil {
            let manager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-manager, to: FlowTransactionSchedulerUtils.managerStoragePath)

            let managerCap = signer.capabilities.storage
                .issue<&{FlowTransactionSchedulerUtils.Manager}>(
                    FlowTransactionSchedulerUtils.managerStoragePath
                )
            signer.capabilities.publish(managerCap, at: FlowTransactionSchedulerUtils.managerPublicPath)
        }

        let manager = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("Could not borrow manager")

        // Prepare transaction data
        let transactionData: {String: UInt64} = {"planId": planId}

        // Estimate fees
        let est = FlowTransactionScheduler.estimate(
            data: transactionData,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort
        )

        // Withdraw fees
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Missing FlowToken vault")

        let fees <- vaultRef.withdraw(amount: est.flowFee ?? 0.0) as! @FlowToken.Vault

        // Schedule
        let transactionId = manager.schedule(
            handlerCap: handlerCap,
            data: transactionData,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort,
            fees: <-fees
        )

        log("Scheduled DCA execution: ".concat(transactionId.toString()))
    }
}
```

### 5. Copy Scripts

```bash
cp _backup/cadence/scripts/get_all_plans.cdc cadence/scripts/
cp _backup/cadence/scripts/get_plan_details.cdc cadence/scripts/
cp _backup/cadence/scripts/get_active_plans.cdc cadence/scripts/
cp _backup/cadence/scripts/check_controller_configured.cdc cadence/scripts/
```

### 6. Testing Workflow

Once everything is in place:

```bash
# 1. Start emulator (Terminal 1)
flow emulator start

# 2. Start dev wallet (Terminal 2)
flow dev-wallet

# 3. Deploy contracts (Terminal 3)
flow project deploy --network emulator

# 4. Initialize controller
flow transactions send cadence/transactions/setup_controller.cdc \
  --network emulator --signer emulator-account

# 5. Initialize handler
flow transactions send cadence/transactions/init_dca_handler.cdc \
  --network emulator --signer emulator-account

# 6. Create plan
flow transactions send cadence/transactions/create_plan.cdc \
  10.0 7 100 nil 300 \
  --network emulator --signer emulator-account

# 7. Schedule execution
flow transactions send cadence/transactions/schedule_dca_plan.cdc \
  1 300 128 1000 \
  --network emulator --signer emulator-account

# 8. Query plans
flow scripts execute cadence/scripts/get_all_plans.cdc 0xf8d6e0586b0a20c7 \
  --network emulator
```

## 📚 Resources

### Scaffold Locations
- **Scheduled Transactions**: `/tmp/scheduledtransactions-scaffold/`
- **Flow Actions**: `/tmp/flow-actions-scaffold/`

### Key Reference Files
- Handler pattern: `/tmp/scheduledtransactions-scaffold/cadence/contracts/CounterTransactionHandler.cdc`
- Init pattern: `/tmp/scheduledtransactions-scaffold/cadence/transactions/InitCounterTransactionHandler.cdc`
- Schedule pattern: `/tmp/scheduledtransactions-scaffold/cadence/transactions/ScheduleIncrementIn.cdc`
- IncrementFi example: `/tmp/flow-actions-scaffold/cadence/transactions/increment_fi_restake.cdc`

### Documentation
- DeFi Actions: https://github.com/onflow/FlowActions
- Scheduled Transactions: https://developers.flow.com/build/advanced-concepts/scheduled-transactions
- Fork Testing: https://developers.flow.com/blockchain-development-tutorials/cadence/fork-testing
- IncrementFi: https://www.increment.fi/

## 🎓 Learning Path

This project demonstrates:
1. ✅ Building on official scaffolds
2. ✅ Proper dependency management with `flow.json`
3. ✅ FlowTransactionScheduler.TransactionHandler interface
4. 🔄 DeFi Actions composition (in progress)
5. 🔄 IncrementFi connector integration (in progress)
6. 🔄 Fork testing for real DEX state (todo)

## 🔧 Troubleshooting

### Dependencies won't install
- Make sure Flow CLI is up to date: `flow version`
- Check network connectivity
- Try: `flow deps install --update`

### Contracts won't deploy
- Check imports match dependency aliases
- Verify all contracts are in `flow.json`
- Look for circular dependencies

### IncrementFi pair not found
- Use fork testing to access testnet state
- Query pair registry with scripts
- Check pair addresses on IncrementFi docs

### Scheduled transaction not executing
- Ensure handler is properly initialized
- Check manager has sufficient FLOW for fees
- Verify capability is correctly issued
- Look for events in transaction result

---

**Current Commit:** All dependencies configured, ready for `flow deps install`

**Next Commit:** After integrating real IncrementFi swaps
