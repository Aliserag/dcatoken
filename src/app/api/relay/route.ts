/**
 * Transaction Relay API
 *
 * Backend API for sponsored Cadence transactions.
 * Service account signs and pays for transactions so Metamask users
 * don't need a Flow wallet.
 *
 * Security:
 * - Private key only accessible server-side
 * - All params validated before submission
 * - On-chain validation ensures allowance exists
 */

import { NextRequest, NextResponse } from "next/server";
import * as fcl from "@onflow/fcl";
import { SHA3 } from "sha3";
import { ec as EC } from "elliptic";

const curve = new EC("p256");

// Network-specific contract addresses
const CONTRACTS_BY_NETWORK = {
  mainnet: {
    DCAServiceEVM: "0xca7ee55e4fc3251a",
    DCAHandlerEVMV4: "0xca7ee55e4fc3251a",
    FlowToken: "0x1654653399040a61",
    FungibleToken: "0xf233dcee88fe0abe",
    FlowTransactionScheduler: "0xe467b9dd11fa00df",
    FlowTransactionSchedulerUtils: "0xe467b9dd11fa00df",
    EVM: "0xe467b9dd11fa00df",
  },
  testnet: {
    DCAServiceEVM: "0x2376ce69fdac1763",
    DCAHandlerEVMV4: "0x2376ce69fdac1763",
    FlowToken: "0x7e60df042a9c0868",
    FungibleToken: "0x9a0766d93b6608b7",
    FlowTransactionScheduler: "0x8c5303eaa26202d6",
    FlowTransactionSchedulerUtils: "0x8c5303eaa26202d6",
    EVM: "0x8c5303eaa26202d6",
  },
};

// Network-specific service account configuration
const SERVICE_CONFIG = {
  mainnet: {
    address: "0xca7ee55e4fc3251a",
    keyId: 1,
    privateKeyEnv: "PRIVATE_KEY_MAINNET_CADENCE",
  },
  testnet: {
    address: "0x2376ce69fdac1763",
    keyId: 0,
    privateKeyEnv: "PRIVATE_KEY_TESTNET_CADENCE",
  },
};

type NetworkType = "mainnet" | "testnet";

interface NetworkConfig {
  network: NetworkType;
  contracts: typeof CONTRACTS_BY_NETWORK.mainnet;
  serviceAddress: string;
  serviceKeyId: number;
  privateKey: string | undefined;
}

// Get network configuration from request
const getNetworkConfig = (network: string): NetworkConfig => {
  const validNetwork: NetworkType =
    network === "mainnet" || network === "testnet" ? network : "mainnet";
  const contracts = CONTRACTS_BY_NETWORK[validNetwork];
  const serviceConfig = SERVICE_CONFIG[validNetwork];
  const privateKey = process.env[serviceConfig.privateKeyEnv];

  return {
    network: validNetwork,
    contracts,
    serviceAddress: serviceConfig.address,
    serviceKeyId: serviceConfig.keyId,
    privateKey,
  };
};

// Hash message for signing (SHA3-256)
const hashMessageHex = (msgHex: string): Buffer => {
  const sha = new SHA3(256);
  sha.update(Buffer.from(msgHex, "hex"));
  return sha.digest();
};

// Sign with private key using elliptic curve
const signWithKey = (privateKey: string, msgHex: string): string => {
  const key = curve.keyFromPrivate(Buffer.from(privateKey, "hex"));
  const sig = key.sign(hashMessageHex(msgHex));
  const n = 32;
  const r = sig.r.toArrayLike(Buffer, "be", n);
  const s = sig.s.toArrayLike(Buffer, "be", n);
  return Buffer.concat([r, s]).toString("hex");
};

// Create service account signer with network-specific config
const createServiceSigner = (config: NetworkConfig) => {
  return async (account: any): Promise<any> => {
    return {
      ...account,
      tempId: `${config.serviceAddress}-${config.serviceKeyId}`,
      addr: fcl.sansPrefix(config.serviceAddress),
      keyId: config.serviceKeyId,
      signingFunction: async (signable: any) => ({
        addr: fcl.withPrefix(config.serviceAddress),
        keyId: config.serviceKeyId,
        signature: signWithKey(config.privateKey!, signable.message),
      }),
    };
  };
};

// Generate Cadence transaction to create a DCA plan
const getCreatePlanTx = (contracts: NetworkConfig["contracts"]) => `
import EVM from ${contracts.EVM}
import DCAServiceEVM from ${contracts.DCAServiceEVM}

transaction(
    userEVMAddressHex: String,
    sourceTokenHex: String,
    targetTokenHex: String,
    amountPerInterval: UInt256,
    intervalSeconds: UInt64,
    maxSlippageBps: UInt64,
    maxExecutions: UInt64?,
    feeTier: UInt32,
    firstExecutionDelay: UFix64
) {
    prepare(signer: auth(Storage) &Account) {
        // Service account creates plan on behalf of user
    }

    execute {
        let userEVMAddress = EVM.addressFromString(userEVMAddressHex)
        let sourceToken = EVM.addressFromString(sourceTokenHex)
        let targetToken = EVM.addressFromString(targetTokenHex)
        let firstExecutionTime = getCurrentBlock().timestamp + firstExecutionDelay

        let planId = DCAServiceEVM.createPlan(
            userEVMAddress: userEVMAddress,
            sourceToken: sourceToken,
            targetToken: targetToken,
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds,
            maxSlippageBps: maxSlippageBps,
            maxExecutions: maxExecutions,
            feeTier: feeTier,
            firstExecutionTime: firstExecutionTime
        )

        log("Created DCA plan with ID: ".concat(planId.toString()))
    }
}
`;

// Generate Cadence transaction to schedule a DCA plan
const getSchedulePlanTx = (contracts: NetworkConfig["contracts"]) => `
import FlowTransactionScheduler from ${contracts.FlowTransactionScheduler}
import FlowTransactionSchedulerUtils from ${contracts.FlowTransactionSchedulerUtils}
import FlowToken from ${contracts.FlowToken}
import FungibleToken from ${contracts.FungibleToken}
import DCAHandlerEVMV4 from ${contracts.DCAHandlerEVMV4}
import DCAServiceEVM from ${contracts.DCAServiceEVM}

transaction(planId: UInt64, totalFeeAmount: UFix64) {

    let flowVault: auth(FungibleToken.Withdraw) &FlowToken.Vault
    let handlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>
    let managerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>
    let feeProviderCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>
    let firstExecutionTime: UFix64

    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Get main FLOW vault
        self.flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("FlowToken vault not found")

        // Get plan details
        let plan = DCAServiceEVM.getPlan(planId: planId)
            ?? panic("Plan not found")

        if plan.nextExecutionTime == nil {
            panic("Plan has no next execution time set")
        }
        self.firstExecutionTime = plan.nextExecutionTime!

        // Create fee vault if it doesn't exist
        let feeVaultPath = /storage/DCAHandlerEVMV4FeeVault
        if signer.storage.borrow<&FlowToken.Vault>(from: feeVaultPath) == nil {
            let feeVault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
            signer.storage.save(<-feeVault, to: feeVaultPath)

            // Create capability for fee vault
            let cap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &FlowToken.Vault>(feeVaultPath)
            // Note: capability is created but we'll find it below
        }

        // Fund the fee vault with enough for all executions
        let feeVaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: feeVaultPath)!
        let funding <- self.flowVault.withdraw(amount: totalFeeAmount)
        feeVaultRef.deposit(from: <-funding)

        // Get Handler capability
        var foundHandlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>? = nil
        let handlerControllers = signer.capabilities.storage.getControllers(forPath: DCAHandlerEVMV4.HandlerStoragePath)

        for controller in handlerControllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}> {
                if cap.check() {
                    foundHandlerCap = cap
                    break
                }
            }
        }
        self.handlerCap = foundHandlerCap ?? panic("No valid handler capability found")

        // Get Manager capability
        var foundManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>? = nil
        let managerControllers = signer.capabilities.storage.getControllers(forPath: FlowTransactionSchedulerUtils.managerStoragePath)

        for controller in managerControllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}> {
                if cap.check() {
                    foundManagerCap = cap
                    break
                }
            }
        }
        self.managerCap = foundManagerCap ?? panic("No valid manager capability found")

        // Get Fee Vault capability (should exist now)
        var foundFeeVaultCap: Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault>? = nil
        let feeVaultControllers = signer.capabilities.storage.getControllers(forPath: feeVaultPath)

        for controller in feeVaultControllers {
            if let cap = controller.capability as? Capability<auth(FungibleToken.Withdraw) &FlowToken.Vault> {
                if cap.check() {
                    foundFeeVaultCap = cap
                    break
                }
            }
        }

        // If no capability found, create one
        if foundFeeVaultCap == nil {
            foundFeeVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &FlowToken.Vault>(feeVaultPath)
        }

        self.feeProviderCap = foundFeeVaultCap ?? panic("Could not create fee vault capability")
    }

    execute {
        // executionEffort based on swap type:
        // - Cadence-only swaps (IncrementFi): 400
        // - EVM swaps (UniswapV3): 5000 (includes bridging + UniswapV3 overhead)
        // DCAServiceEVM always uses EVM swaps
        let executionEffort: UInt64 = 5000
        let priority = FlowTransactionScheduler.Priority.Medium

        let loopConfig = DCAHandlerEVMV4.createLoopConfig(
            schedulerManagerCap: self.managerCap,
            feeProviderCap: self.feeProviderCap,
            priority: priority,
            executionEffort: executionEffort
        )

        let txData = DCAHandlerEVMV4.createTransactionData(
            planId: planId,
            loopConfig: loopConfig
        )

        let feeEstimate = FlowTransactionScheduler.estimate(
            data: txData as AnyStruct,
            timestamp: self.firstExecutionTime,
            priority: priority,
            executionEffort: executionEffort
        )

        // Use estimated fee with 5% buffer, cap at 10.0 FLOW
        var feeAmount = (feeEstimate.flowFee ?? 0.01) * 1.05
        if feeAmount > 10.0 {
            feeAmount = 10.0
        }

        // Get fee vault to withdraw initial fee
        let feeVault = self.feeProviderCap.borrow()
            ?? panic("Could not borrow fee vault")
        let fees <- feeVault.withdraw(amount: feeAmount) as! @FlowToken.Vault

        let manager = self.managerCap.borrow()
            ?? panic("Could not borrow scheduler manager")

        let scheduledId = manager.schedule(
            handlerCap: self.handlerCap,
            data: txData as AnyStruct,
            timestamp: self.firstExecutionTime,
            priority: priority,
            executionEffort: executionEffort,
            fees: <- fees
        )

        log("Scheduled DCA plan with scheduled ID: ".concat(scheduledId.toString()))
    }
}
`;

// Configure FCL based on network
const configureFCL = (network: NetworkType) => {
  if (network === "testnet") {
    fcl.config({
      "flow.network": "testnet",
      "accessNode.api": "https://rest-testnet.onflow.org",
    });
  } else {
    fcl.config({
      "flow.network": "mainnet",
      "accessNode.api": "https://rest-mainnet.onflow.org",
    });
  }
  console.log(`Relay API configured for ${network}`);
};

// Extract plan ID from transaction events
const extractPlanId = (events: any[]): number | null => {
  for (const event of events) {
    if (event.type.includes("PlanCreated")) {
      return parseInt(event.data.planId);
    }
  }
  return null;
};

export async function POST(request: NextRequest) {
  const { action, params, network: requestNetwork } = await request.json();

  // Get network-specific configuration
  const config = getNetworkConfig(requestNetwork || "mainnet");

  console.log("Relay API called:", { action, params, network: config.network });

  // Validate service account configuration
  if (!config.privateKey) {
    console.error(`Private key not configured for ${config.network}`);
    return NextResponse.json(
      { success: false, error: `Service account not configured for ${config.network}` },
      { status: 500 }
    );
  }

  // Configure FCL for the requested network
  configureFCL(config.network);

  // Create signer with network-specific config
  const serviceSigner = createServiceSigner(config);

  try {
    if (action === "createPlan") {
      // Validate required params
      if (
        !params.userEVMAddress ||
        !params.sourceToken ||
        !params.targetToken
      ) {
        return NextResponse.json(
          { success: false, error: "Missing required parameters" },
          { status: 400 }
        );
      }

      const txId = await fcl.mutate({
        cadence: getCreatePlanTx(config.contracts),
        args: (arg: any, t: any) => [
          arg(params.userEVMAddress, t.String),
          arg(params.sourceToken, t.String),
          arg(params.targetToken, t.String),
          arg(params.amountPerInterval, t.UInt256),
          arg(params.intervalSeconds.toString(), t.UInt64),
          arg(params.maxSlippageBps.toString(), t.UInt64),
          params.maxExecutions !== null
            ? arg(params.maxExecutions.toString(), t.Optional(t.UInt64))
            : arg(null, t.Optional(t.UInt64)),
          arg(params.feeTier.toString(), t.UInt32),
          arg(params.firstExecutionDelay.toFixed(1), t.UFix64),
        ],
        proposer: serviceSigner as any,
        payer: serviceSigner as any,
        authorizations: [serviceSigner as any],
        limit: 9999,
      });

      const result = await fcl.tx(txId).onceSealed();

      if (result.errorMessage) {
        return NextResponse.json(
          { success: false, txId, error: result.errorMessage },
          { status: 500 }
        );
      }

      // Extract planId from events
      const planId = extractPlanId(result.events);
      console.log("Plan created:", { txId, planId, network: config.network, events: result.events });

      return NextResponse.json({ success: true, txId, planId });
    }

    if (action === "schedulePlan") {
      if (!params.planId) {
        return NextResponse.json(
          { success: false, error: "Missing planId parameter" },
          { status: 400 }
        );
      }

      // Calculate total fee needed for all executions
      // Based on mainnet analysis with executionEffort: 5000
      // - Actual fee estimate: ~1.0 FLOW per execution
      // - Handler adds 10% buffer when rescheduling: ~1.1 FLOW
      // - Initial schedule also takes ~1.05 FLOW
      // Using 1.25 FLOW per execution to ensure sufficient funds for rescheduling
      const maxExecutions = params.maxExecutions || 10;
      const feePerExecution = 1.25; // ~1.1 FLOW actual + 15% safety buffer
      const totalFeeAmount = (feePerExecution * maxExecutions).toFixed(8);

      console.log("Scheduling plan with fees:", {
        planId: params.planId,
        maxExecutions,
        totalFeeAmount,
        network: config.network,
      });

      const txId = await fcl.mutate({
        cadence: getSchedulePlanTx(config.contracts),
        args: (arg: any, t: any) => [
          arg(params.planId.toString(), t.UInt64),
          arg(totalFeeAmount, t.UFix64),
        ],
        proposer: serviceSigner as any,
        payer: serviceSigner as any,
        authorizations: [serviceSigner as any],
        limit: 9999,
      });

      const result = await fcl.tx(txId).onceSealed();

      if (result.errorMessage) {
        return NextResponse.json(
          { success: false, txId, error: result.errorMessage },
          { status: 500 }
        );
      }

      console.log("Plan scheduled:", { txId, planId: params.planId, network: config.network });
      return NextResponse.json({ success: true, txId });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Relay API error:", error.message, error);
    return NextResponse.json(
      { success: false, error: error.message || "Transaction failed" },
      { status: 500 }
    );
  }
}
