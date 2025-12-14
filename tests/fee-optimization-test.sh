#!/bin/bash
# Fee Optimization Test Script
# Creates multiple DCA plans and monitors fee usage

set -e

# Configuration
API_URL="http://localhost:3000/api/relay"
NETWORK="testnet"

# Token addresses on testnet
WFLOW="0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e"
USDF="0xd7d43ab7b365f0d0789aE83F4385fA710FfdC98F"
USER_EVM="0xCC18E51efc529ed41e48aE5DEa8fCeC60A2baefE"

# Results file
RESULTS_FILE="tests/fee-test-results.csv"

# Initialize results file
echo "test_id,plan_id,amount,max_exec,direction,deposited,status" > "$RESULTS_FILE"

# Function to create a plan via API
create_plan() {
    local source=$1
    local target=$2
    local amount=$3
    local max_exec=$4
    local test_id=$5

    echo "Creating plan: $test_id (${amount} wei, $max_exec executions)"

    response=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"action\": \"createPlan\",
            \"params\": {
                \"userEVMAddress\": \"$USER_EVM\",
                \"sourceToken\": \"$source\",
                \"targetToken\": \"$target\",
                \"amountPerInterval\": \"$amount\",
                \"intervalSeconds\": 60,
                \"maxSlippageBps\": 100,
                \"maxExecutions\": $max_exec,
                \"feeTier\": 3000,
                \"firstExecutionDelay\": 60
            }
        }")

    plan_id=$(echo "$response" | grep -o '"planId":[0-9]*' | cut -d: -f2)
    success=$(echo "$response" | grep -o '"success":true')

    if [ -n "$success" ] && [ -n "$plan_id" ]; then
        echo "  Created Plan #$plan_id"
        echo "$plan_id"
    else
        echo "  Failed to create plan: $response"
        echo ""
    fi
}

# Function to schedule a plan
schedule_plan() {
    local plan_id=$1
    local max_exec=$2

    echo "Scheduling Plan #$plan_id..."

    response=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"action\": \"schedulePlan\",
            \"params\": {
                \"planId\": $plan_id,
                \"maxExecutions\": $max_exec
            }
        }")

    success=$(echo "$response" | grep -o '"success":true')

    if [ -n "$success" ]; then
        echo "  Scheduled successfully"
        return 0
    else
        echo "  Failed to schedule: $response"
        return 1
    fi
}

# Function to check plan status
check_plan_status() {
    local plan_id=$1

    result=$(flow scripts execute cadence/scripts/evm/get_plan.cdc "$plan_id" --network testnet 2>&1 | grep "statusRaw")
    status=$(echo "$result" | sed 's/.*statusRaw: \([0-9]*\).*/\1/')
    exec_count=$(echo "$result" | sed 's/.*executionCount: \([0-9]*\).*/\1/')

    echo "$status:$exec_count"
}

echo "=== Fee Optimization Test Suite ==="
echo ""

# Test Group A: Varying execution counts (WFLOW → USDF)
echo "=== Group A: Varying Execution Counts (WFLOW → USDF) ==="

# A1: 0.01 WFLOW, 2 executions
plan_id=$(create_plan "$WFLOW" "$USDF" "10000000000000000" 2 "A1")
if [ -n "$plan_id" ]; then
    sleep 2
    schedule_plan "$plan_id" 2
    echo "A1,$plan_id,0.01,2,WFLOW->USDF,1.70,pending" >> "$RESULTS_FILE"
fi
sleep 5

# A2: 0.01 WFLOW, 3 executions
plan_id=$(create_plan "$WFLOW" "$USDF" "10000000000000000" 3 "A2")
if [ -n "$plan_id" ]; then
    sleep 2
    schedule_plan "$plan_id" 3
    echo "A2,$plan_id,0.01,3,WFLOW->USDF,2.55,pending" >> "$RESULTS_FILE"
fi
sleep 5

# A3: 0.01 WFLOW, 5 executions
plan_id=$(create_plan "$WFLOW" "$USDF" "10000000000000000" 5 "A3")
if [ -n "$plan_id" ]; then
    sleep 2
    schedule_plan "$plan_id" 5
    echo "A3,$plan_id,0.01,5,WFLOW->USDF,4.25,pending" >> "$RESULTS_FILE"
fi
sleep 5

# A4: 0.1 WFLOW, 2 executions
plan_id=$(create_plan "$WFLOW" "$USDF" "100000000000000000" 2 "A4")
if [ -n "$plan_id" ]; then
    sleep 2
    schedule_plan "$plan_id" 2
    echo "A4,$plan_id,0.1,2,WFLOW->USDF,1.70,pending" >> "$RESULTS_FILE"
fi
sleep 5

# A5: 0.1 WFLOW, 3 executions
plan_id=$(create_plan "$WFLOW" "$USDF" "100000000000000000" 3 "A5")
if [ -n "$plan_id" ]; then
    sleep 2
    schedule_plan "$plan_id" 3
    echo "A5,$plan_id,0.1,3,WFLOW->USDF,2.55,pending" >> "$RESULTS_FILE"
fi
sleep 5

echo ""
echo "=== Group A Complete (5 plans created) ==="
echo ""
echo "Plans will execute over the next several minutes."
echo "Results tracked in: $RESULTS_FILE"
echo ""
cat "$RESULTS_FILE"
