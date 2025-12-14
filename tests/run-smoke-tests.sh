#!/bin/bash

# Smoke Tests for DCA Testnet Deployment
# Tests basic functionality of deployed contracts

set -e

# Load environment variables
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Ensure both keys are available
export PRIVATE_KEY_TESTNET=${PRIVATE_KEY_TESTNET:-${PRIVATE_KEY_TESTNET}}
export PRIVATE_KEY_MAINNET=${PRIVATE_KEY_MAINNET:-$PRIVATE_KEY_TESTNET}

NETWORK="testnet"
PASSED=0
FAILED=0

echo "=========================================="
echo "DCA TESTNET SMOKE TESTS"
echo "=========================================="
echo ""

# Test 1: Get COA Address
echo "TEST 1: Get COA Address"
RESULT=$(flow scripts execute cadence/scripts/evm/get_coa_address.cdc --network $NETWORK 2>&1 | grep "Result:" | cut -d' ' -f2)
if [ ! -z "$RESULT" ]; then
    echo "✅ PASSED - COA Address: $RESULT"
    ((PASSED++))
else
    echo "❌ FAILED - Could not get COA address"
    ((FAILED++))
fi
echo ""

# Test 2: Get Total Plans
echo "TEST 2: Get Total Plans"
RESULT=$(flow scripts execute cadence/scripts/evm/get_total_plans.cdc --network $NETWORK 2>&1 | grep "Result:" | cut -d' ' -f2)
if [ ! -z "$RESULT" ]; then
    echo "✅ PASSED - Total Plans: $RESULT"
    ((PASSED++))
else
    echo "❌ FAILED - Could not get total plans"
    ((FAILED++))
fi
echo ""

# Test 3: Check Allowance (should return 0 for unapproved)
echo "TEST 3: Check Allowance (WFLOW)"
USER_ADDR="0xcc18e51efc529ed41e48ae5dea8fcec60a2baefe"
WFLOW_ADDR="0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e"
RESULT=$(flow scripts execute cadence/scripts/evm/check_allowance.cdc "$USER_ADDR" "$WFLOW_ADDR" --network $NETWORK 2>&1 | grep "Result:" | cut -d' ' -f2)
if [ ! -z "$RESULT" ]; then
    echo "✅ PASSED - WFLOW Allowance: $RESULT"
    ((PASSED++))
else
    echo "❌ FAILED - Could not check allowance"
    ((FAILED++))
fi
echo ""

# Test 4: Get User Plans (should return empty or existing plans)
echo "TEST 4: Get User Plans"
RESULT=$(flow scripts execute cadence/scripts/evm/get_user_plans.cdc "$USER_ADDR" --network $NETWORK 2>&1)
if echo "$RESULT" | grep -q "Result:"; then
    echo "✅ PASSED - Got user plans"
    ((PASSED++))
else
    echo "❌ FAILED - Could not get user plans"
    ((FAILED++))
fi
echo ""

# Test 5: Verify contract imports are correct
echo "TEST 5: Verify DCAServiceEVM Contract"
ACCOUNT_INFO=$(flow accounts get 0x4a22e2fce83584aa --network $NETWORK 2>&1)
if echo "$ACCOUNT_INFO" | grep -q "DCAServiceEVM"; then
    echo "✅ PASSED - DCAServiceEVM contract deployed"
    ((PASSED++))
else
    echo "❌ FAILED - DCAServiceEVM contract not found"
    ((FAILED++))
fi
echo ""

# Test 6: Verify DCAHandlerEVMV4 Contract
echo "TEST 6: Verify DCAHandlerEVMV4 Contract"
if echo "$ACCOUNT_INFO" | grep -q "DCAHandlerEVMV4"; then
    echo "✅ PASSED - DCAHandlerEVMV4 contract deployed"
    ((PASSED++))
else
    echo "❌ FAILED - DCAHandlerEVMV4 contract not found"
    ((FAILED++))
fi
echo ""

# Test 7: Check Fee Balance Script
echo "TEST 7: Check Fee Balance"
RESULT=$(flow scripts execute cadence/scripts/evm/get_fee_balance.cdc "0x4a22e2fce83584aa" --network $NETWORK 2>&1)
if echo "$RESULT" | grep -q "Result:"; then
    FEE_BAL=$(echo "$RESULT" | grep "Result:" | cut -d' ' -f2)
    echo "✅ PASSED - Fee Balance: $FEE_BAL FLOW"
    ((PASSED++))
else
    echo "❌ FAILED - Could not check fee balance"
    ((FAILED++))
fi
echo ""

# Summary
echo "=========================================="
echo "SMOKE TEST SUMMARY"
echo "=========================================="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Total:  $((PASSED + FAILED))"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
    echo "🎉 All smoke tests passed!"
    exit 0
else
    echo "⚠️  Some smoke tests failed"
    exit 1
fi
