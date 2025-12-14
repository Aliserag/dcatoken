#!/bin/bash

# Monitor DCA Plans on Testnet
# This script periodically checks plan status and execution counts

set -e

# Load environment variables
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

export PRIVATE_KEY_TESTNET=${PRIVATE_KEY_TESTNET:-${PRIVATE_KEY_TESTNET}}
export PRIVATE_KEY_MAINNET=${PRIVATE_KEY_MAINNET:-$PRIVATE_KEY_TESTNET}

NETWORK="testnet"

echo "=========================================="
echo "DCA TESTNET MONITOR"
echo "=========================================="
echo "Started at: $(date)"
echo ""

# Function to get plan status
get_plan_status() {
    local plan_id=$1
    flow scripts execute cadence/scripts/evm/get_plan.cdc $plan_id --network $NETWORK 2>/dev/null | grep "Result:" | sed 's/Result: //'
}

# Function to extract value from plan data (macOS compatible)
extract_value() {
    local data=$1
    local key=$2
    # Use sed instead of grep -P for macOS compatibility
    echo "$data" | sed -n "s/.*${key}: \([^,)]*\).*/\1/p" | head -1 || echo "N/A"
}

# Monitor plans
monitor_plans() {
    echo ""
    echo "--- Checking Plans at $(date) ---"
    echo ""

    # Get total plans
    TOTAL=$(flow scripts execute cadence/scripts/evm/get_total_plans.cdc --network $NETWORK 2>/dev/null | grep "Result:" | awk '{print $2}')
    echo "Total Plans: $TOTAL"
    echo ""

    for plan_id in $(seq 1 $TOTAL); do
        echo "Plan #$plan_id:"

        plan_data=$(get_plan_status $plan_id)

        if [ -n "$plan_data" ]; then
            exec_count=$(extract_value "$plan_data" "executionCount")
            max_exec=$(extract_value "$plan_data" "maxExecutions")
            status_raw=$(extract_value "$plan_data" "statusRaw")
            total_source=$(extract_value "$plan_data" "totalSourceSpent")
            total_target=$(extract_value "$plan_data" "totalTargetReceived")
            next_exec=$(extract_value "$plan_data" "nextExecutionTime")

            # Convert status
            case $status_raw in
                0) status="Active" ;;
                1) status="Paused" ;;
                2) status="Completed" ;;
                3) status="Cancelled" ;;
                *) status="Unknown ($status_raw)" ;;
            esac

            echo "  Status: $status"
            echo "  Executions: $exec_count / $max_exec"
            echo "  Total Source Spent: $total_source wei"
            echo "  Total Target Received: $total_target wei"
            echo "  Next Execution: $next_exec"
        else
            echo "  Could not retrieve plan data"
        fi
        echo ""
    done

    # Check fee vault balance
    echo "Fee Vault Balance:"
    FEE_BAL=$(flow scripts execute cadence/scripts/evm/get_fee_balance.cdc "0x4a22e2fce83584aa" --network $NETWORK 2>/dev/null | grep "Result:" | awk '{print $2}')
    echo "  $FEE_BAL FLOW remaining"
    echo ""
}

# Single run or continuous monitoring
if [ "$1" == "--continuous" ]; then
    INTERVAL=${2:-60}  # Default 60 seconds
    echo "Continuous monitoring mode (interval: ${INTERVAL}s)"
    echo "Press Ctrl+C to stop"
    echo ""

    while true; do
        monitor_plans
        echo "Next check in ${INTERVAL}s..."
        echo ""
        sleep $INTERVAL
    done
else
    monitor_plans
fi

echo "=========================================="
echo "Monitor completed at: $(date)"
echo "=========================================="
