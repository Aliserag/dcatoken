# Mainnet Deployment Guide

This guide walks through deploying the DCA Token contracts to Flow Mainnet.

## Prerequisites

- Flow CLI installed and updated
- Mainnet account with sufficient FLOW for deployment gas fees (~5-10 FLOW recommended)
- Private key for your mainnet account

## Step 1: Account Setup

### Option A: Use Existing Mainnet Account

If you already have a mainnet account, skip to Step 2.

### Option B: Create New Mainnet Account

1. **Generate a new key pair:**

```bash
flow keys generate
```

Save the output:
- **Private Key**: Store securely (never commit to git!)
- **Public Key**: Use for account creation

2. **Create account via Flow Port:**

Visit https://port.flow.com/ and:
- Connect your wallet OR create new account
- Fund with FLOW tokens (minimum 5 FLOW for deployment)
- Note your account address (format: `0x1234567890abcdef`)

## Step 2: Configure flow.json

Add your mainnet account to `flow.json`:

```json
{
  "accounts": {
    "emulator-account": {
      "address": "f8d6e0586b0a20c7",
      "key": {
        "type": "file",
        "location": "emulator-account.pkey"
      }
    },
    "mainnet-deployer": {
      "address": "YOUR_MAINNET_ADDRESS",
      "key": {
        "type": "file",
        "location": "mainnet-deployer.pkey"
      }
    }
  }
}
```

3. **Store your private key:**

```bash
# Create private key file (replace YOUR_PRIVATE_KEY with actual key)
echo "YOUR_PRIVATE_KEY" > mainnet-deployer.pkey

# Secure the file
chmod 600 mainnet-deployer.pkey

# Add to .gitignore
echo "mainnet-deployer.pkey" >> .gitignore
```

## Step 3: Configure Mainnet Deployment

Add deployment configuration to `flow.json`:

```json
{
  "deployments": {
    "emulator": {
      "emulator-account": [
        "DeFiMath",
        "DCAPlan",
        "DCAController",
        "DCATransactionHandler"
      ]
    },
    "mainnet": {
      "mainnet-deployer": [
        "DeFiMath",
        "DCAPlan",
        "DCAController",
        "DCATransactionHandler"
      ]
    }
  }
}
```

## Step 4: Deploy to Mainnet

1. **Verify your account balance:**

```bash
flow accounts get YOUR_MAINNET_ADDRESS --network mainnet
```

Ensure you have at least 5 FLOW available.

2. **Deploy contracts:**

```bash
flow project deploy --network mainnet
```

This will deploy in order:
1. DeFiMath
2. DCAPlan
3. DCAController
4. DCATransactionHandler

Expected output:
```
Deploying 4 contracts for accounts: mainnet-deployer

DeFiMath -> 0xYOUR_ADDRESS
DCAPlan -> 0xYOUR_ADDRESS
DCAController -> 0xYOUR_ADDRESS
DCATransactionHandler -> 0xYOUR_ADDRESS

✨ All contracts deployed successfully
```

3. **Note deployed addresses:**

Save the contract addresses for frontend configuration:

```
DeFiMath: 0xYOUR_ADDRESS
DCAPlan: 0xYOUR_ADDRESS
DCAController: 0xYOUR_ADDRESS
DCATransactionHandler: 0xYOUR_ADDRESS
```

## Step 5: Update Frontend Configuration

Update `src/config/fcl-config.ts`:

```typescript
mainnet: {
  // System contracts
  FlowToken: "0x1654653399040a61",
  FungibleToken: "0xf233dcee88fe0abe",

  // IncrementFi contracts
  SwapFactory: "0xb063c16cac85dbd1",
  SwapRouter: "0xa6850776a94e6551",
  SwapInterfaces: "0xb78ef7afa52ff906",

  // DCA contracts (UPDATE THESE)
  DCAController: "0xYOUR_ADDRESS",
  DCAPlan: "0xYOUR_ADDRESS",
  DCATransactionHandler: "0xYOUR_ADDRESS",
  DeFiMath: "0xYOUR_ADDRESS"
}
```

## Step 6: Verify Deployment

Test the deployed contracts:

```bash
# Check controller script
flow scripts execute cadence/scripts/check_controller_configured.cdc YOUR_MAINNET_ADDRESS --network mainnet

# Expected: false (no controller setup yet)
```

## Step 7: Initialize DCA Controller

Users must run setup before creating plans:

```bash
flow transactions send cadence/transactions/setup_controller.cdc \
  --network mainnet \
  --signer mainnet-deployer
```

Verify setup:

```bash
flow scripts execute cadence/scripts/check_controller_configured.cdc YOUR_MAINNET_ADDRESS --network mainnet

# Expected: true
```

## Step 8: Test Plan Creation

Create a test DCA plan (0.1 USDT → FLOW, minutely for testing):

```bash
flow transactions send cadence/transactions/create_plan.cdc \
  0.1 \
  0.0007 \
  100 \
  nil \
  60 \
  --network mainnet \
  --signer mainnet-deployer
```

Parameters:
- `0.1` - Amount per interval (0.1 USDT)
- `0.0007` - Interval in days (0.0007 days = 1 minute for testing)
- `100` - Max slippage (100 bps = 1%)
- `nil` - No max executions (unlimited)
- `60` - First execution in 60 seconds

Verify plan created:

```bash
flow scripts execute cadence/scripts/get_all_plans.cdc YOUR_MAINNET_ADDRESS --network mainnet
```

## Security Best Practices

### Private Key Management

**NEVER:**
- Commit private keys to git
- Share private keys in chat/email
- Use the same key for multiple environments

**ALWAYS:**
- Store keys in secure password manager
- Use separate keys for mainnet vs testnet
- Backup keys securely
- Add `*.pkey` to `.gitignore`

### Contract Security

Before mainnet deployment:
- [ ] Audit contract code for vulnerabilities
- [ ] Test extensively on testnet
- [ ] Verify slippage protection logic
- [ ] Test with real USDT/FLOW swaps
- [ ] Document all admin functions

### Gas Optimization

Estimated deployment costs:
- DeFiMath: ~0.5 FLOW
- DCAPlan: ~1.5 FLOW
- DCAController: ~1.0 FLOW
- DCATransactionHandler: ~2.0 FLOW
- **Total: ~5 FLOW + buffer**

### Post-Deployment

1. **Verify contracts on FlowScan:**
   - Visit https://flowscan.io/
   - Search for your account address
   - Verify all 4 contracts deployed

2. **Test in production:**
   - Connect wallet via Flow Port
   - Setup controller
   - Create small test plan (0.1 USDT)
   - Monitor execution

3. **Monitor execution:**
   - Check plan status regularly
   - Watch for swap events
   - Verify slippage protection
   - Track average execution price

## Troubleshooting

### "Insufficient balance" Error

Ensure you have enough USDT in your wallet:

```bash
flow scripts execute cadence/scripts/get_token_balance.cdc YOUR_ADDRESS "USDT" --network mainnet
```

### "Controller not configured" Error

Run setup transaction:

```bash
flow transactions send cadence/transactions/setup_controller.cdc --network mainnet --signer mainnet-deployer
```

### Swap Execution Fails

Check:
1. USDT balance > amount per interval
2. FLOW/USDT pool has liquidity on IncrementFi
3. Slippage tolerance not too restrictive
4. Execution time has passed

### Gas Fees Too High

Deployment costs vary with network load. If costs are too high:
- Wait for lower network activity
- Consider testnet deployment first
- Optimize contract code to reduce size

## Next Steps

After successful deployment:

1. **Update README.md** with mainnet addresses
2. **Test end-to-end** with real swaps
3. **Add monitoring** for plan executions
4. **Document** for end users
5. **Consider audit** before public launch

## Support

- Flow Discord: https://discord.gg/flow
- Flow Forum: https://forum.onflow.org/
- Documentation: https://developers.flow.com/

---

**Last Updated:** 2025-01-XX
**Mainnet Deployment Version:** 1.0.0
