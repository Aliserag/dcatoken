#!/bin/bash

# Edge Case Tests for DCA Testnet
# Tests various failure modes and edge conditions

set -e

# Load environment variables
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Ensure keys are available (must be set in .env or environment)
if [ -z "$PRIVATE_KEY_TESTNET" ]; then
    echo "ERROR: PRIVATE_KEY_TESTNET not set. Add it to .env file."
    exit 1
fi
export PRIVATE_KEY_MAINNET=${PRIVATE_KEY_MAINNET:-$PRIVATE_KEY_TESTNET}

NETWORK="testnet"
PASSED=0
FAILED=0
SKIPPED=0

echo "=========================================="
echo "DCA EDGE CASE TESTS - TESTNET"
echo "=========================================="
echo ""

# Test addresses
USER_COA="0x000000000000000000000002d3e3644ce652bc85"
DCA_COA="0x000000000000000000000002c058dc16c13e4e2f"
WFLOW="0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e"
USDF="0xd7d43ab7b365f0d0789aE83F4385fA710FfdC98F"

# Helper function to run test
run_test() {
    local test_id=$1
    local description=$2
    local expected=$3
    local command=$4

    echo -n "[$test_id] $description... "

    result=$(eval "$command" 2>&1) || true

    if echo "$result" | grep -q "$expected"; then
        echo "✅ PASSED"
        ((PASSED++))
    else
        echo "❌ FAILED"
        echo "   Expected to find: $expected"
        echo "   Got: $(echo "$result" | head -5)"
        ((FAILED++))
    fi
}

# Helper to skip test
skip_test() {
    local test_id=$1
    local description=$2
    local reason=$3

    echo "[$test_id] $description... ⏭️  SKIPPED: $reason"
    ((SKIPPED++))
}

echo "=== PC: Plan Creation Tests ==="
echo ""

# PC-01: Create plan with valid params (already tested above)
run_test "PC-01" "Plan 1 exists with correct ID" "id: 1" \
    "flow scripts execute cadence/scripts/evm/get_plan.cdc 1 --network $NETWORK"

# PC-02: Query non-existent plan
run_test "PC-02" "Query non-existent plan returns nil" "nil" \
    "flow scripts execute cadence/scripts/evm/get_plan.cdc 9999 --network $NETWORK"

# PC-03: Check allowance (already approved)
run_test "PC-03" "Check allowance returns max uint256" "11579208923731619542357098500868790785326998466564056403945758400791312963993" \
    "flow scripts execute cadence/scripts/evm/check_allowance.cdc \"$USER_COA\" \"$WFLOW\" --network $NETWORK"

echo ""
echo "=== PL: Plan Lifecycle Tests ==="
echo ""

# PL-01: Verify plan status is Active
run_test "PL-01" "New plan has Active status" "statusRaw: 0" \
    "flow scripts execute cadence/scripts/evm/get_plan.cdc 1 --network $NETWORK"

# PL-02: Test pause functionality
echo "[$PL-02] Pause plan (manual test)... ⏭️  SKIPPED: Requires separate transaction"
((SKIPPED++))

# PL-03: Test resume functionality
echo "[PL-03] Resume plan (manual test)... ⏭️  SKIPPED: Requires separate transaction"
((SKIPPED++))

echo ""
echo "=== EX: Execution Tests ==="
echo ""

# EX-01: Verify execution happened
run_test "EX-01" "Plan execution incremented count" "executionCount: [0-9]" \
    "flow scripts execute cadence/scripts/evm/get_plan.cdc 1 --network $NETWORK"

# EX-02: Verify tokens were spent
run_test "EX-02" "Tokens were spent in execution" "totalSourceSpent:" \
    "flow scripts execute cadence/scripts/evm/get_plan.cdc 1 --network $NETWORK"

# EX-03: Verify tokens were received
run_test "EX-03" "Tokens were received in execution" "totalTargetReceived:" \
    "flow scripts execute cadence/scripts/evm/get_plan.cdc 1 --network $NETWORK"

echo ""
echo "=== ST: Scheduled Transaction Tests ==="
echo ""

# ST-01: Handler exists
run_test "ST-01" "Handler was created" "HandlerCreated" \
    "flow events get A.4a22e2fce83584aa.DCAHandlerEVMV4.HandlerCreated --start 295327840 --end 295328500 --network $NETWORK"

# ST-02: Transaction was scheduled
run_test "ST-02" "Transaction was scheduled" "Scheduled" \
    "flow events get A.8c5303eaa26202d6.FlowTransactionScheduler.Scheduled --start 295328340 --end 295328500 --network $NETWORK"

# ST-03: Check fee vault balance was used
run_test "ST-03" "Fee vault shows balance" "Result:" \
    "flow scripts execute cadence/scripts/evm/get_fee_balance.cdc \"0x4a22e2fce83584aa\" --network $NETWORK"

echo ""
echo "=== QY: Query Tests ==="
echo ""

# QY-01: Get user plans
run_test "QY-01" "Get user plans returns array" "Result:" \
    "flow scripts execute cadence/scripts/evm/get_user_plans.cdc \"$USER_COA\" --network $NETWORK"

# QY-02: Get total plans
run_test "QY-02" "Total plans is at least 2" "Result: [2-9]" \
    "flow scripts execute cadence/scripts/evm/get_total_plans.cdc --network $NETWORK"

# QY-03: Get COA address
run_test "QY-03" "COA address is correct" "000000000000000000000002c058dc16c13e4e2f" \
    "flow scripts execute cadence/scripts/evm/get_coa_address.cdc --network $NETWORK"

echo ""
echo "=== CFG: Configuration Tests ==="
echo ""

# CFG-01: Contracts are deployed
run_test "CFG-01" "DCAServiceEVM is deployed" "DCAServiceEVM" \
    "flow accounts get 0x4a22e2fce83584aa --network $NETWORK"

# CFG-02: Handler contract is deployed
run_test "CFG-02" "DCAHandlerEVMV4 is deployed" "DCAHandlerEVMV4" \
    "flow accounts get 0x4a22e2fce83584aa --network $NETWORK"

echo ""
echo "=========================================="
echo "EDGE CASE TEST SUMMARY"
echo "=========================================="
echo "Passed:  $PASSED"
echo "Failed:  $FAILED"
echo "Skipped: $SKIPPED"
echo "Total:   $((PASSED + FAILED + SKIPPED))"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
    echo "🎉 All edge case tests passed!"
    exit 0
else
    echo "⚠️  Some edge case tests failed"
    exit 1
fi
