/**
 * FCL Configuration for Flow DCA
 *
 * Configures Flow Client Library for connecting to the Flow blockchain.
 * Supports emulator, testnet, and mainnet environments.
 */

import * as fcl from "@onflow/fcl";

// Contract addresses from flow.json deployments
export const CONTRACTS = {
  emulator: {
    DeFiMath: "0xf8d6e0586b0a20c7",
    DCAPlan: "0xf8d6e0586b0a20c7",
    DCAController: "0xf8d6e0586b0a20c7",
    DCATransactionHandler: "0xf8d6e0586b0a20c7",
    FlowToken: "0x0ae53cb6e3f42a79",
    FungibleToken: "0xee82856bf20e2aa6",
    FlowTransactionScheduler: "0xf8d6e0586b0a20c7",
    DeFiActions: "0xf8d6e0586b0a20c7",
    IncrementFiSwapConnectors: "0xf8d6e0586b0a20c7",
    SwapFactory: "0xf8d6e0586b0a20c7",
    SwapInterfaces: "0xf8d6e0586b0a20c7",
  },
  testnet: {
    DeFiMath: "", // To be deployed
    DCAPlan: "", // To be deployed
    DCAController: "", // To be deployed
    DCATransactionHandler: "", // To be deployed
    FlowToken: "0x7e60df042a9c0868",
    FungibleToken: "0x9a0766d93b6608b7",
    FlowTransactionScheduler: "0x8c5303eaa26202d6",
    DeFiActions: "0x4c2ff9dd03ab442f",
    IncrementFiSwapConnectors: "0x49bae091e5ea16b5",
    SwapFactory: "0xb063c16cac85dbd1",
    SwapInterfaces: "0xb78ef7afa52ff906",
  },
  mainnet: {
    DeFiMath: "", // To be deployed
    DCAPlan: "", // To be deployed
    DCAController: "", // To be deployed
    DCATransactionHandler: "", // To be deployed
    FlowToken: "0x1654653399040a61",
    FungibleToken: "0xf233dcee88fe0abe",
    FlowTransactionScheduler: "0xe467b9dd11fa00df",
    DeFiActions: "0x92195d814edf9cb0",
    IncrementFiSwapConnectors: "0x49bae091e5ea16b5",
    SwapFactory: "0xb063c16cac85dbd1",
    SwapInterfaces: "0xb78ef7afa52ff906",
  },
};

// Get current network from environment or default to emulator
export const NETWORK = (process.env.NEXT_PUBLIC_FLOW_NETWORK || "emulator") as keyof typeof CONTRACTS;

// Get contract addresses for current network
export const getContractAddress = (contractName: keyof typeof CONTRACTS.emulator): string => {
  return CONTRACTS[NETWORK][contractName];
};

/**
 * Initialize FCL with appropriate configuration
 */
export const configureFCL = () => {
  if (NETWORK === "emulator") {
    fcl.config({
      "app.detail.title": "Flow DCA",
      "app.detail.icon": "https://placekitten.com/g/200/200", // TODO: Replace with actual logo
      "flow.network": "emulator",
      "accessNode.api": "http://127.0.0.1:8888", // Emulator access node
      "discovery.wallet": "http://localhost:8701/fcl/authn", // Dev Wallet
      "0xDeFiMath": getContractAddress("DeFiMath"),
      "0xDCAPlan": getContractAddress("DCAPlan"),
      "0xDCAController": getContractAddress("DCAController"),
      "0xDCATransactionHandler": getContractAddress("DCATransactionHandler"),
      "0xFlowToken": getContractAddress("FlowToken"),
      "0xFungibleToken": getContractAddress("FungibleToken"),
      "0xFlowTransactionScheduler": getContractAddress("FlowTransactionScheduler"),
      "0xDeFiActions": getContractAddress("DeFiActions"),
      "0xIncrementFiSwapConnectors": getContractAddress("IncrementFiSwapConnectors"),
    });
  } else if (NETWORK === "testnet") {
    fcl.config({
      "app.detail.title": "Flow DCA",
      "app.detail.icon": "https://placekitten.com/g/200/200", // TODO: Replace with actual logo
      "flow.network": "testnet",
      "accessNode.api": "https://rest-testnet.onflow.org",
      "discovery.wallet": "https://fcl-discovery.onflow.org/testnet/authn",
      "0xDeFiMath": getContractAddress("DeFiMath"),
      "0xDCAPlan": getContractAddress("DCAPlan"),
      "0xDCAController": getContractAddress("DCAController"),
      "0xDCATransactionHandler": getContractAddress("DCATransactionHandler"),
      "0xFlowToken": getContractAddress("FlowToken"),
      "0xFungibleToken": getContractAddress("FungibleToken"),
      "0xFlowTransactionScheduler": getContractAddress("FlowTransactionScheduler"),
      "0xDeFiActions": getContractAddress("DeFiActions"),
      "0xIncrementFiSwapConnectors": getContractAddress("IncrementFiSwapConnectors"),
      "0xSwapFactory": getContractAddress("SwapFactory"),
      "0xSwapInterfaces": getContractAddress("SwapInterfaces"),
    });
  } else if (NETWORK === "mainnet") {
    fcl.config({
      "app.detail.title": "Flow DCA",
      "app.detail.icon": "https://placekitten.com/g/200/200", // TODO: Replace with actual logo
      "flow.network": "mainnet",
      "accessNode.api": "https://rest-mainnet.onflow.org",
      "discovery.wallet": "https://fcl-discovery.onflow.org/authn",
      "0xFlowToken": getContractAddress("FlowToken"),
      "0xFungibleToken": getContractAddress("FungibleToken"),
      "0xFlowTransactionScheduler": getContractAddress("FlowTransactionScheduler"),
      "0xDeFiActions": getContractAddress("DeFiActions"),
      "0xIncrementFiSwapConnectors": getContractAddress("IncrementFiSwapConnectors"),
      "0xSwapFactory": getContractAddress("SwapFactory"),
      "0xSwapInterfaces": getContractAddress("SwapInterfaces"),
    });
  }
};

/**
 * Transaction status types for UI feedback
 */
export enum TransactionStatus {
  IDLE = "IDLE",
  PENDING = "PENDING",
  EXECUTING = "EXECUTING",
  SEALING = "SEALING",
  SEALED = "SEALED",
  ERROR = "ERROR",
}

/**
 * Helper to convert FCL status codes to our TransactionStatus enum
 */
export const mapFCLStatus = (statusCode: number): TransactionStatus => {
  switch (statusCode) {
    case 0: // UNKNOWN
    case 1: // PENDING
      return TransactionStatus.PENDING;
    case 2: // FINALIZED
      return TransactionStatus.EXECUTING;
    case 3: // EXECUTED
      return TransactionStatus.SEALING;
    case 4: // SEALED
      return TransactionStatus.SEALED;
    case 5: // EXPIRED
      return TransactionStatus.ERROR;
    default:
      return TransactionStatus.IDLE;
  }
};
