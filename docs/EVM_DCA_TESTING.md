# EVM DCA Testing Guide

## Overview

This guide walks through testing the EVM-native DCA system on Flow mainnet.

## Prerequisites

1. An EVM wallet (Metamask) with ERC-20 tokens on Flow EVM
2. The deployer account with FLOW for transaction fees

## Step 1: Get the Shared COA Address

```bash
flow scripts execute cadence/scripts/evm/get_coa_address.cdc --network mainnet
```

**Result:** `0x000000000000000000000002623833e1789dbd4a`

This is the address users need to approve for their ERC-20 tokens.

## Step 2: User Approves COA (in Metamask)

The user needs to call `approve()` on their source token contract:

```javascript
// In Metamask or via ethers.js
const tokenContract = new ethers.Contract(sourceTokenAddress, ERC20_ABI, signer);
const coaAddress = "0x000000000000000000000002623833e1789dbd4a";
const amount = ethers.parseUnits("100", 18); // 100 tokens with 18 decimals

await tokenContract.approve(coaAddress, amount);
```

## Step 3: Create a DCA Plan

```bash
# Example: DCA from USDC to WFLOW
# - User EVM address: 0x... (the user's Metamask address)
# - Source token: USDC address on Flow EVM
# - Target token: WFLOW address on Flow EVM
# - Amount: 10 USDC per interval (10000000 = 10 * 10^6 for 6 decimals)
# - Interval: 3600 seconds (1 hour)
# - Max slippage: 100 bps (1%)
# - Fee tier: 3000 (0.3%)
# - First execution delay: 60 seconds

flow transactions send cadence/transactions/evm/create_plan.cdc \
  "0xYOUR_USER_EVM_ADDRESS" \
  "0xSOURCE_TOKEN_ADDRESS" \
  "0xTARGET_TOKEN_ADDRESS" \
  10000000 \
  3600 \
  100 \
  nil \
  3000 \
  60.0 \
  --network mainnet --signer mainnet-deployer
```

## Step 4: Schedule the Plan

```bash
# Replace 1 with the actual plan ID from step 3
flow transactions send cadence/transactions/evm/schedule_plan.cdc 1 \
  --network mainnet --signer mainnet-deployer
```

## Step 5: Monitor Execution

Check plan status:
```bash
flow scripts execute cadence/scripts/evm/get_plan.cdc 1 --network mainnet
```

## Token Addresses on Flow EVM Mainnet

| Token | Address | Decimals |
|-------|---------|----------|
| WFLOW | `0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e` | 18 |
| USDC (stgUSDC) | `0xF1815bd50389c46847f0Bda824eC8da914045D14` | 6 |
| USDT (stgUSDT) | `0x674843C06FF83502ddb4D37c2E09C01cdA38cbc8` | 6 |
| USDF (USD Flow) | `0x2aaBea2058b5aC2D339b163C6Ab6f2b6d53aabED` | 18 |
| USDC.e (Celer) | `0x7f27352D5F83Db87a5A3E00f4B07Cc2138D8ee52` | 6 |
| stFlow | `0x5598c0652B899EB40f169Dd5949BdBE0BF36ffDe` | 18 |
| WBTC | `0x717DAE2BaF7656BE9a9B01deE31d571a9d4c9579` | 8 |
| WETH | `0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590` | 18 |

**Source:** [Flow DeFi Contracts](https://developers.flow.com/ecosystem/defi-liquidity/defi-contracts)

## Checking Allowance

```bash
flow scripts execute cadence/scripts/evm/check_allowance.cdc \
  "0xUSER_EVM_ADDRESS" \
  "0xTOKEN_ADDRESS" \
  --network mainnet
```

## Troubleshooting

### "Insufficient allowance"
User needs to approve more tokens via Metamask.

### "Swap failed"
- Check liquidity pool exists for the token pair
- Verify fee tier is correct for the pool
- Ensure COA has enough FLOW for gas

### "Failed to pull tokens"
- User's token balance may be insufficient
- Allowance may have been revoked

## Example: USDC → WFLOW DCA Plan

This example creates a plan to DCA 10 USDC into WFLOW every hour.

### 1. User approves COA for USDC (in Metamask)

```javascript
// Token: stgUSDC on Flow EVM
const usdcAddress = "0xF1815bd50389c46847f0Bda824eC8da914045D14";
const coaAddress = "0x000000000000000000000002623833e1789dbd4a";
const amount = 100000000; // 100 USDC (6 decimals)

// Call approve on USDC contract
await usdcContract.approve(coaAddress, amount);
```

### 2. Create the plan

```bash
# User EVM address: 0xYourMetamaskAddress
# Source: USDC (0xF1815bd50389c46847f0Bda824eC8da914045D14)
# Target: WFLOW (0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e)
# Amount: 10 USDC per hour = 10000000 (6 decimals)
# Interval: 3600 seconds (1 hour)
# Slippage: 100 bps (1%)
# Fee tier: 3000 (0.3% pool)

flow transactions send cadence/transactions/evm/create_plan.cdc \
  "0xYourMetamaskAddress" \
  "0xF1815bd50389c46847f0Bda824eC8da914045D14" \
  "0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e" \
  10000000 \
  3600 \
  100 \
  10 \
  3000 \
  120.0 \
  --network mainnet --signer mainnet-deployer
```

### 3. Schedule execution

```bash
flow transactions send cadence/transactions/evm/schedule_plan.cdc 1 \
  --network mainnet --signer mainnet-deployer
```

### 4. Monitor

```bash
# Check plan status
flow scripts execute cadence/scripts/evm/get_plan.cdc 1 --network mainnet

# Check allowance
flow scripts execute cadence/scripts/evm/check_allowance.cdc \
  "0xYourMetamaskAddress" \
  "0xF1815bd50389c46847f0Bda824eC8da914045D14" \
  --network mainnet
```

## Events to Watch

- `PlanCreated` - New plan registered
- `PlanExecuted` - Successful DCA execution
- `ExecutionFailed` - Failed execution (check reason)
- `InsufficientAllowance` - User needs to approve more tokens
