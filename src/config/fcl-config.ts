/**
 * FCL Configuration for Flow DCA (EVM Version)
 *
 * Configures Flow Client Library for connecting to the Flow blockchain.
 * Uses the EVM-native DCA system with DCAServiceEVM.
 */

import * as fcl from "@onflow/fcl";

// Contract addresses - only EVM DCA system
export const CONTRACTS = {
  mainnet: {
    DCAServiceEVM: "0xca7ee55e4fc3251a",
    DCAHandlerEVMV4: "0xca7ee55e4fc3251a",
    FlowToken: "0x1654653399040a61",
    FungibleToken: "0xf233dcee88fe0abe",
    FlowTransactionScheduler: "0xe467b9dd11fa00df",
    FlowTransactionSchedulerUtils: "0xe467b9dd11fa00df",
    EVM: "0xe467b9dd11fa00df",
    SwapFactory: "0xb063c16cac85dbd1",
    SwapInterfaces: "0xb78ef7afa52ff906",
  },
  testnet: {
    DCAServiceEVM: "",
    DCAHandlerEVMV4: "",
    FlowToken: "0x7e60df042a9c0868",
    FungibleToken: "0x9a0766d93b6608b7",
    FlowTransactionScheduler: "0x8c5303eaa26202d6",
    FlowTransactionSchedulerUtils: "0x8c5303eaa26202d6",
    EVM: "0x8c5303eaa26202d6",
    SwapFactory: "0xb063c16cac85dbd1",
    SwapInterfaces: "0xb78ef7afa52ff906",
  },
  emulator: {
    DCAServiceEVM: "0xf8d6e0586b0a20c7",
    DCAHandlerEVMV4: "0xf8d6e0586b0a20c7",
    FlowToken: "0x0ae53cb6e3f42a79",
    FungibleToken: "0xee82856bf20e2aa6",
    FlowTransactionScheduler: "0xf8d6e0586b0a20c7",
    FlowTransactionSchedulerUtils: "0xf8d6e0586b0a20c7",
    EVM: "0xf8d6e0586b0a20c7",
    SwapFactory: "0xf8d6e0586b0a20c7",
    SwapInterfaces: "0xf8d6e0586b0a20c7",
  },
};

// EVM Token Addresses (mainnet)
export const EVM_TOKENS = {
  WFLOW: "0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e",
  USDF: "0x2aaBea2058b5aC2D339b163C6Ab6f2b6d53aabED",
  USDC: "0xF1815bd50389c46847f0Bda824eC8da914045D14",
};

// DCA Service Shared COA Address (mainnet)
export const DCA_COA_ADDRESS = "0x000000000000000000000002623833e1789dbd4a";

// Get current network from environment or default to mainnet
export const NETWORK = (process.env.NEXT_PUBLIC_FLOW_NETWORK || "mainnet") as keyof typeof CONTRACTS;

// Get contract addresses for current network
export const getContractAddress = (contractName: keyof typeof CONTRACTS.mainnet): string => {
  return CONTRACTS[NETWORK][contractName];
};

/**
 * Initialize FCL with appropriate configuration
 */
export const configureFCL = () => {
  if (NETWORK === "emulator") {
    fcl.config({
      "app.detail.title": "Flow DCA",
      "app.detail.icon": "https://placekitten.com/g/200/200",
      "flow.network": "emulator",
      "accessNode.api": "http://127.0.0.1:8888",
      "discovery.wallet": "http://localhost:8701/fcl/authn",
      "0xDCAServiceEVM": getContractAddress("DCAServiceEVM"),
      "0xFlowToken": getContractAddress("FlowToken"),
      "0xFungibleToken": getContractAddress("FungibleToken"),
      "0xFlowTransactionScheduler": getContractAddress("FlowTransactionScheduler"),
      "0xFlowTransactionSchedulerUtils": getContractAddress("FlowTransactionSchedulerUtils"),
      "0xEVM": getContractAddress("EVM"),
    });
  } else if (NETWORK === "testnet") {
    fcl.config({
      "app.detail.title": "Flow DCA",
      "app.detail.icon": "https://placekitten.com/g/200/200",
      "flow.network": "testnet",
      "accessNode.api": "https://rest-testnet.onflow.org",
      "discovery.wallet": "https://fcl-discovery.onflow.org/testnet/authn",
      "0xDCAServiceEVM": getContractAddress("DCAServiceEVM"),
      "0xFlowToken": getContractAddress("FlowToken"),
      "0xFungibleToken": getContractAddress("FungibleToken"),
      "0xFlowTransactionScheduler": getContractAddress("FlowTransactionScheduler"),
      "0xFlowTransactionSchedulerUtils": getContractAddress("FlowTransactionSchedulerUtils"),
      "0xEVM": getContractAddress("EVM"),
    });
  } else if (NETWORK === "mainnet") {
    fcl.config({
      "app.detail.title": "Flow DCA",
      "app.detail.icon": "https://placekitten.com/g/200/200",
      "flow.network": "mainnet",
      "accessNode.api": "https://rest-mainnet.onflow.org",
      "discovery.wallet": "https://fcl-discovery.onflow.org/authn",
      "0xDCAServiceEVM": getContractAddress("DCAServiceEVM"),
      "0xFlowToken": getContractAddress("FlowToken"),
      "0xFungibleToken": getContractAddress("FungibleToken"),
      "0xFlowTransactionScheduler": getContractAddress("FlowTransactionScheduler"),
      "0xFlowTransactionSchedulerUtils": getContractAddress("FlowTransactionSchedulerUtils"),
      "0xEVM": getContractAddress("EVM"),
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
