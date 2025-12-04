# V3 Frontend Integration Guide

## Overview

This document outlines how to integrate the V3 EVM DCA system into the frontend. The V3 transactions have been added to `cadence-transactions.ts`, but the UI components need to be updated to support the new workflow.

---

## What's Different in V3

### V2 (Current - IncrementFi / Cadence)
- **Token Pair**: FLOW → USDC (EVM bridged)
- **DEX**: IncrementFi (Cadence-native pools)
- **Setup**: 2 steps (controller + handler)
- **Execution**: Automatic via scheduled transactions

### V3 (New - EVM DEXes)
- **Token Pair**: FLOW → USDF (Flow native stablecoin)
- **DEX**: FlowSwap V3 / PunchSwap V2 (EVM DEXes with automatic fallback)
- **Setup**: 3 steps (COA + controller + handler)
- **Execution**: COA-based autonomous execution on EVM
- **Key Feature**: No MetaMask needed - uses Cadence-Owned Account

---

## Required Frontend Changes

### 1. Update Transaction Exports in `cadence-transactions.ts`

**Already Done** - V3 transactions have been added:
- `SETUP_COA_TX_V3`
- `SETUP_CONTROLLER_TX_V3`
- `INIT_DCA_HANDLER_TX_V3`
- `CREATE_FUND_AND_SCHEDULE_PLAN_TX_V3`
- `GET_ALL_PLANS_SCRIPT_V3`
- `CHECK_COA_SETUP_SCRIPT_V3`
- `CHECK_CONTROLLER_SCRIPT_V3`

### 2. Update Create Plan Component (`src/components/dca/create-plan.tsx`)

#### A. Add V3 State Management

```typescript
// Add to existing state
const [coaConfigured, setCoaConfigured] = useState(false);
const [checkingCOA, setCheckingCOA] = useState(false);
const [coaBalance, setCoaBalance] = useState("0.00");
const [useV3, setUseV3] = useState(true); // Toggle for V3 mode

// Import V3 scripts
import {
  SETUP_COA_TX_V3,
  SETUP_CONTROLLER_TX_V3,
  INIT_DCA_HANDLER_TX_V3,
  CREATE_FUND_AND_SCHEDULE_PLAN_TX_V3,
  CHECK_COA_SETUP_SCRIPT_V3,
  CHECK_CONTROLLER_SCRIPT_V3,
} from "@/lib/cadence-transactions";
```

#### B. Add COA Check Function

```typescript
const checkCOA = async (address: string) => {
  setCheckingCOA(true);
  try {
    const coaInfo = await fcl.query({
      cadence: CHECK_COA_SETUP_SCRIPT_V3,
      args: (arg, t) => [arg(address, t.Address)],
    });

    if (coaInfo) {
      setCoaConfigured(true);
      setCoaBalance(parseFloat(coaInfo.balance).toFixed(4));
    } else {
      setCoaConfigured(false);
      setCoaBalance("0.00");
    }
  } catch (error) {
    console.error("Error checking COA:", error);
    setCoaConfigured(false);
  } finally {
    setCheckingCOA(false);
  }
};
```

#### C. Update User Effect Hook

```typescript
useEffect(() => {
  const unsubscribe = fcl.currentUser.subscribe((currentUser) => {
    if (currentUser && currentUser.addr) {
      setUserAddress(currentUser.addr);

      if (useV3) {
        checkCOA(currentUser.addr);
        // V3 uses different controller
        // checkControllerV3(currentUser.addr);
      } else {
        checkController(currentUser.addr);
      }

      fetchBalances(currentUser.addr);
    } else {
      setUserAddress(null);
      setCoaConfigured(false);
      setControllerConfigured(false);
    }
  });

  return () => unsubscribe();
}, [useV3]);
```

#### D. Add COA Setup Handler

```typescript
const handleSetupCOA = async (e: React.FormEvent) => {
  e.preventDefault();

  // Recommend 1.0 FLOW funding for gas
  const result = await executeTransaction(
    SETUP_COA_TX_V3,
    (arg, t) => [arg("1.0", t.UFix64)], // Fund with 1 FLOW
    500
  );

  if (result.success && userAddress) {
    setTimeout(() => checkCOA(userAddress), 2000);
  }
};
```

#### E. Update Controller Setup for V3

```typescript
const handleSetupControllerV3 = async (e: React.FormEvent) => {
  e.preventDefault();

  await executeTransaction(SETUP_CONTROLLER_TX_V3, () => [], 500);

  if (userAddress) {
    setTimeout(() => {
      // Check both COA and controller
      checkCOA(userAddress);
      checkControllerV3(userAddress);
    }, 2000);
  }
};
```

#### F. Update Plan Creation for V3

```typescript
const handleSubmitV3 = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!coaConfigured) {
    alert("Please setup COA first");
    return;
  }

  if (!controllerConfigured) {
    alert("Please setup DCA Controller V3 first");
    return;
  }

  // Auto-initialize handler if needed
  if (!handlerInitialized) {
    const handlerResult = await executeTransaction(
      INIT_DCA_HANDLER_TX_V3,
      (arg, t) => [],
      500
    );

    if (!handlerResult.success) {
      alert(`Handler initialization failed: ${handlerResult.error}`);
      return;
    }

    setHandlerInitialized(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    resetTransaction();
  }

  // Prepare arguments (FLOW → USDF)
  const slippageBps = Math.floor(parseFloat(slippage) * 100);
  const firstExecutionDelay = parseInt(interval);
  const formattedAmount = parseFloat(amountPerInterval).toFixed(2);
  const numExecutionsToFund = maxExecutions || "1000";

  const result = await executeTransaction(
    CREATE_FUND_AND_SCHEDULE_PLAN_TX_V3,
    (arg, t) => [
      arg(formattedAmount, t.UFix64),
      arg(interval, t.UInt64),
      arg(slippageBps.toString(), t.UInt64),
      arg(maxExecutions || null, t.Optional(t.UInt64)),
      arg(firstExecutionDelay.toString(), t.UInt64),
      arg(numExecutionsToFund, t.UInt64),
      arg("1", t.UInt8), // Priority: Medium
      arg("1000", t.UInt64), // executionEffort (reduced for EVM)
    ],
    1000
  );

  if (result.success) {
    alert("✅ V3 Plan created! Swaps will execute on EVM DEXes.");
    setAmountPerInterval("");
    setMaxExecutions("");
    if (userAddress) {
      fetchBalances(userAddress);
    }
    resetTransaction();
  }
};
```

#### G. Update UI to Show Setup Steps

```tsx
{/* V3 Setup Steps */}
{useV3 && (
  <div className="space-y-4 mb-6">
    {/* Step 1: COA Setup */}
    {!coaConfigured && (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
            1
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Setup Cadence-Owned Account (COA)
            </h4>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Required for EVM DEX swaps. Your COA will be funded with 1.0 FLOW for gas fees.
            </p>
            <button
              onClick={handleSetupCOA}
              disabled={txLoading || checkingCOA}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {checkingCOA ? "Checking..." : txLoading ? "Setting up..." : "Setup COA"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Step 2: Controller Setup */}
    {coaConfigured && !controllerConfigured && (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
            ✓
          </div>
          <div className="flex-1">
            <p className="text-sm text-green-800 dark:text-green-200 mb-1">
              COA configured (Balance: {coaBalance} FLOW)
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 mt-3">
          <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
            2
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Setup DCA Controller V3
            </h4>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Configure vault capabilities for FLOW → USDF swaps.
            </p>
            <button
              onClick={handleSetupControllerV3}
              disabled={txLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {txLoading ? "Setting up..." : "Setup Controller"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* All Steps Complete */}
    {coaConfigured && controllerConfigured && (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="font-semibold">V3 Setup Complete!</span>
        </div>
        <p className="text-sm text-green-700 dark:text-green-300 mt-2">
          You're ready to create EVM DCA plans. Swaps will execute on FlowSwap V3 and PunchSwap V2.
        </p>
        <div className="flex items-center gap-3 mt-2 text-xs text-green-600 dark:text-green-400">
          <span>COA Balance: {coaBalance} FLOW</span>
          <span>•</span>
          <span>FLOW → USDF enabled</span>
        </div>
      </div>
    )}
  </div>
)}

{/* V2/V3 Toggle */}
<div className="flex justify-center mb-4">
  <button
    type="button"
    onClick={() => setUseV3(!useV3)}
    className="text-xs text-gray-500 hover:text-[#00EF8B] transition-colors"
  >
    {useV3 ? "← Switch to V2 (IncrementFi)" : "Switch to V3 (EVM DEXes) →"}
  </button>
</div>
```

### 3. Update Dashboard Component (`src/components/dca/dashboard.tsx`)

#### A. Add V3 Plan Support

```typescript
// Import V3 scripts
import {
  GET_ALL_PLANS_SCRIPT_V3,
  PAUSE_PLAN_TX,
  RESUME_PLAN_TX,
} from "@/lib/cadence-transactions";

// Add state for V3 toggle
const [useV3, setUseV3] = useState(true);

// Update fetchPlans to use V3 script when enabled
const fetchPlans = async (address: string) => {
  setLoading(true);
  setError(null);
  try {
    const script = useV3 ? GET_ALL_PLANS_SCRIPT_V3 : GET_ALL_PLANS_SCRIPT;

    const cadencePlans: CadencePlanDetails[] = await fcl.query({
      cadence: script,
      args: (arg, t) => [arg(address, t.Address)],
    });

    // Transform plans (V3 uses USDF instead of USDC)
    const transformedPlans = cadencePlans.map((cp) => {
      // ... existing transformation logic

      // Update token display for V3
      const targetToken = useV3 ? "USDF" : "USDC";

      return {
        // ... existing fields
        targetToken, // Add this field
      };
    });

    setPlans(transformedPlans);
  } catch (err: any) {
    console.error("Error fetching plans:", err);
    setError(err.message || "Failed to fetch plans");
  } finally {
    setLoading(false);
  }
};
```

#### B. Update Display to Show Token Type

```tsx
<p className="text-lg font-bold font-mono">
  {plan.totalAcquired}
  <span className="text-sm text-gray-500 ml-1">
    {plan.targetToken || "USDC"} {/* Use targetToken field */}
  </span>
</p>
```

#### C. Add V2/V3 Toggle in Dashboard

```tsx
{/* Add at top of dashboard */}
<div className="flex justify-between items-center mb-4">
  <h2 className="text-2xl font-bold">Your DCA Plans</h2>
  <div className="flex items-center gap-2">
    <span className="text-sm text-gray-500">
      {useV3 ? "V3 (EVM DEXes)" : "V2 (IncrementFi)"}
    </span>
    <button
      onClick={() => setUseV3(!useV3)}
      className="text-sm text-[#00EF8B] hover:text-[#00D9FF] transition-colors"
    >
      Switch
    </button>
  </div>
</div>
```

---

## Testing Checklist

### Emulator Testing
1. ✅ Deploy V3 contracts: `flow project deploy --network emulator`
2. ✅ Run `setup_coa.cdc` with 1.0 FLOW funding
3. ✅ Run `setup_controller_v3.cdc`
4. ✅ Run `init_dca_handler_v3.cdc`
5. ✅ Create test plan with `create_fund_activate_plan_v3.cdc`
6. ✅ Query plans with `get_all_plans.cdc`
7. ✅ Verify COA with `check_coa_setup.cdc`
8. ✅ Verify controller with `check_controller_setup.cdc`

### Frontend Testing
1. ⬜ Connect wallet and verify COA check works
2. ⬜ Setup COA and verify 1.0 FLOW funding
3. ⬜ Setup Controller V3 and verify all capabilities
4. ⬜ Create plan and verify it appears in dashboard
5. ⬜ Monitor first execution on emulator
6. ⬜ Verify USDF balance increases after swap
7. ⬜ Test pause/resume functionality
8. ⬜ Test plan completion

### Mainnet Deployment
1. ⬜ Deploy V3 contracts to mainnet account
2. ⬜ Update `flow.json` with mainnet deployment addresses
3. ⬜ Update contract imports in transactions
4. ⬜ Test with small amounts (0.1 FLOW)
5. ⬜ Monitor first real swap on FlowSwap V3
6. ⬜ Verify automatic V3→V2 fallback if needed

---

## Key Differences Summary

| Feature | V2 (Current) | V3 (EVM) |
|---------|-------------|----------|
| **DEX** | IncrementFi (Cadence) | FlowSwap V3 / PunchSwap V2 (EVM) |
| **Token Pair** | FLOW → USDC | FLOW → USDF |
| **Setup Steps** | 2 (controller + handler) | 3 (COA + controller + handler) |
| **Gas Handling** | Direct FLOW | COA balance (1.0 FLOW recommended) |
| **Swap Execution** | Cadence-native | EVM via COA |
| **Fallback** | None | Automatic V3→V2 |
| **Precision** | UFix64 (8 decimals) | Rounded to 10^10 wei |
| **Slippage** | Hardcoded paths | User-configured per plan |
| **Contract Names** | DCAPlan, DCAController, DCATransactionHandler | DCAPlanV3, DCAControllerV3, DCATransactionHandlerV3 |

---

## Production Considerations

### COA Management
- Users need ~1.0 FLOW in COA for gas fees
- Monitor COA balance - refill if getting low
- Consider adding "Refill COA" button in UI

### Error Handling
- Handle COA not found errors gracefully
- Show clear messages if V3 pools have low liquidity
- Explain V3→V2 fallback to users

### User Education
- Add tooltip explaining what COA is
- Show gas fee estimates before setup
- Explain difference between V2 and V3 modes
- Document that V3 uses USDF (not USDC)

### Performance
- V3 swaps may take longer than V2 (EVM execution)
- Consider showing "Executing on EVM..." status
- Add transaction explorer links for transparency

---

## Next Steps

1. **Immediate**: Update create-plan.tsx with COA setup flow
2. **Short-term**: Add V3 toggle to dashboard
3. **Medium-term**: Deploy V3 contracts to mainnet
4. **Long-term**: Make V3 the default (deprecate V2)

---

## Resources

- **V3 Contracts**: `cadence/contracts/*V3.cdc`
- **V3 Transactions**: `cadence/transactions/v3/*.cdc`
- **V3 Scripts**: `cadence/scripts/v3/*.cdc`
- **Frontend Templates**: `src/lib/cadence-transactions.ts` (lines 1784-2267)
- **Architecture Doc**: `EVM_INTEGRATION_SUMMARY.md`

---

## Questions & Support

If you encounter issues:
1. Check `EVM_INTEGRATION_SUMMARY.md` for technical details
2. Verify all V3 contracts are deployed: `flow project deploy --network emulator`
3. Ensure COA is funded: Run `check_coa_setup.cdc`
4. Check controller config: Run `check_controller_setup.cdc`
5. Review transaction logs for errors

**Key Files**:
- Contracts: `cadence/contracts/DCA*V3.cdc`
- Transactions: `cadence/transactions/v3/*.cdc`
- Frontend: `src/components/dca/*.tsx`
- Config: `flow.json` (V3 deployments)
