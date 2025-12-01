#!/bin/bash

# Mainnet Setup Script for DCA Token
# This script helps configure mainnet deployment

set -e

echo "🚀 DCA Token - Mainnet Setup"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Flow CLI is installed
if ! command -v flow &> /dev/null; then
    echo -e "${RED}❌ Flow CLI not found${NC}"
    echo "Please install Flow CLI: https://developers.flow.com/tools/flow-cli/install"
    exit 1
fi

echo -e "${GREEN}✅ Flow CLI found${NC}"
echo ""

# Step 1: Generate keys
echo "Step 1: Generate Mainnet Keys"
echo "------------------------------"
echo -e "${YELLOW}Do you want to generate a new key pair? (y/n)${NC}"
read -r GENERATE_KEY

if [ "$GENERATE_KEY" = "y" ]; then
    echo "Generating new key pair..."
    flow keys generate
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Save the private key securely!${NC}"
    echo -e "${YELLOW}⚠️  Never commit private keys to git!${NC}"
    echo ""
    echo "Press Enter after saving your keys..."
    read -r
fi

# Step 2: Configure account
echo "Step 2: Configure Mainnet Account"
echo "-----------------------------------"
echo -e "${YELLOW}Enter your mainnet account address (with 0x prefix):${NC}"
read -r MAINNET_ADDRESS

echo -e "${YELLOW}Enter your private key:${NC}"
read -rs PRIVATE_KEY
echo ""

# Save private key to file
echo "$PRIVATE_KEY" > mainnet-deployer.pkey
chmod 600 mainnet-deployer.pkey

echo -e "${GREEN}✅ Private key saved to mainnet-deployer.pkey${NC}"
echo ""

# Step 3: Update flow.json
echo "Step 3: Update flow.json"
echo "------------------------"

# Check if jq is available for JSON manipulation
if command -v jq &> /dev/null; then
    # Backup original flow.json
    cp flow.json flow.json.backup

    # Add mainnet-deployer account
    jq --arg addr "$MAINNET_ADDRESS" \
       '.accounts["mainnet-deployer"] = {"address": $addr, "key": {"type": "file", "location": "mainnet-deployer.pkey"}}' \
       flow.json > flow.json.tmp && mv flow.json.tmp flow.json

    # Add mainnet deployment config
    jq '.deployments.mainnet = {"mainnet-deployer": ["DeFiMath", "DCAPlan", "DCAController", "DCATransactionHandler"]}' \
       flow.json > flow.json.tmp && mv flow.json.tmp flow.json

    echo -e "${GREEN}✅ flow.json updated${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️  jq not found. Please manually add to flow.json:${NC}"
    echo ""
    echo '{
  "accounts": {
    "mainnet-deployer": {
      "address": "'$MAINNET_ADDRESS'",
      "key": {
        "type": "file",
        "location": "mainnet-deployer.pkey"
      }
    }
  },
  "deployments": {
    "mainnet": {
      "mainnet-deployer": [
        "DeFiMath",
        "DCAPlan",
        "DCAController",
        "DCATransactionHandler"
      ]
    }
  }
}'
    echo ""
fi

# Step 4: Verify account balance
echo "Step 4: Verify Account Balance"
echo "-------------------------------"
echo "Checking mainnet balance for $MAINNET_ADDRESS..."

BALANCE=$(flow accounts get "$MAINNET_ADDRESS" --network mainnet 2>&1 | grep "Balance" || echo "Error fetching balance")

echo "$BALANCE"
echo ""

if echo "$BALANCE" | grep -q "Error"; then
    echo -e "${RED}❌ Could not verify account balance${NC}"
    echo "Please ensure:"
    echo "  1. Account address is correct"
    echo "  2. Account exists on mainnet"
    echo "  3. You have network connectivity"
    exit 1
fi

# Extract balance value
FLOW_BALANCE=$(echo "$BALANCE" | grep -oP '\d+\.\d+' | head -1)

if (( $(echo "$FLOW_BALANCE < 5" | bc -l) )); then
    echo -e "${YELLOW}⚠️  Warning: Balance is less than 5 FLOW${NC}"
    echo "Recommended: At least 5 FLOW for deployment gas fees"
    echo ""
fi

# Step 5: Ready to deploy
echo "Step 5: Ready to Deploy!"
echo "------------------------"
echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Your configuration:"
echo "  - Address: $MAINNET_ADDRESS"
echo "  - Balance: $FLOW_BALANCE FLOW"
echo "  - Key file: mainnet-deployer.pkey"
echo ""
echo "Next steps:"
echo ""
echo "1. Deploy contracts to mainnet:"
echo -e "   ${GREEN}flow project deploy --network mainnet${NC}"
echo ""
echo "2. After deployment, update src/config/fcl-config.ts with deployed contract addresses"
echo ""
echo "3. Test the deployment:"
echo -e "   ${GREEN}flow transactions send cadence/transactions/setup_controller.cdc --network mainnet --signer mainnet-deployer${NC}"
echo ""
echo -e "${YELLOW}⚠️  Remember:${NC}"
echo "  - Backup your mainnet-deployer.pkey file securely"
echo "  - Never commit .pkey files to git"
echo "  - Test thoroughly before public launch"
echo ""
echo "See DEPLOYMENT.md for detailed instructions."
echo ""
