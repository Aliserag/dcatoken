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
import { createHash } from "crypto";
import { ec as EC } from "elliptic";

// Curves for different networks
const p256Curve = new EC("p256");
const secp256k1Curve = new EC("secp256k1");

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
// Testnet uses secp256k1 + SHA2-256, Mainnet uses P256 + SHA3-256
const SERVICE_CONFIG = {
  mainnet: {
    address: "0xca7ee55e4fc3251a",
    keyId: 1,
    privateKeyEnv: "PRIVATE_KEY_MAINNET_CADENCE",
    signatureAlgorithm: "ECDSA_P256",
    hashAlgorithm: "SHA3_256",
  },
  testnet: {
    address: "0x2376ce69fdac1763",
    keyId: 0,
    privateKeyEnv: "PRIVATE_KEY_TESTNET_CADENCE",
    signatureAlgorithm: "ECDSA_secp256k1",
    hashAlgorithm: "SHA2_256",
  },
};

type NetworkType = "mainnet" | "testnet";

interface NetworkConfig {
  network: NetworkType;
  contracts: typeof CONTRACTS_BY_NETWORK.mainnet;
  serviceAddress: string;
  serviceKeyId: number;
  privateKey: string | undefined;
  signatureAlgorithm: string;
  hashAlgorithm: string;
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
    signatureAlgorithm: serviceConfig.signatureAlgorithm,
    hashAlgorithm: serviceConfig.hashAlgorithm,
  };
};

// Hash message for signing with SHA3-256 (for P256/mainnet)
const hashMessageSHA3 = (msgHex: string): Buffer => {
  const sha = new SHA3(256);
  sha.update(Buffer.from(msgHex, "hex"));
  return sha.digest();
};

// Hash message for signing with SHA2-256 (for secp256k1/testnet)
const hashMessageSHA2 = (msgHex: string): Buffer => {
  return createHash("sha256").update(Buffer.from(msgHex, "hex")).digest();
};

// Sign with private key using the correct curve and hash for the network
const signWithKey = (
  privateKey: string,
  msgHex: string,
  signatureAlgorithm: string,
  hashAlgorithm: string
): string => {
  // Select the correct curve
  const curve = signatureAlgorithm === "ECDSA_secp256k1" ? secp256k1Curve : p256Curve;

  // Select the correct hash function
  const hash = hashAlgorithm === "SHA2_256"
    ? hashMessageSHA2(msgHex)
    : hashMessageSHA3(msgHex);

  const key = curve.keyFromPrivate(Buffer.from(privateKey, "hex"));
  const sig = key.sign(hash);
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
        signature: signWithKey(
          config.privateKey!,
          signable.message,
          config.signatureAlgorithm,
          config.hashAlgorithm
        ),
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

// Network-specific FlowFees and FlowStorageFees addresses
const FEE_CONTRACTS = {
  mainnet: {
    FlowFees: "0xf919ee77447b7497",
    FlowStorageFees: "0xe467b9dd11fa00df",
  },
  testnet: {
    FlowFees: "0x912d5440f7e3769e",
    FlowStorageFees: "0x8c5303eaa26202d6",
  },
};

// Generate Cadence transaction to schedule a DCA plan
const getSchedulePlanTx = (contracts: NetworkConfig["contracts"], feeContracts: typeof FEE_CONTRACTS.mainnet) => `
import FlowTransactionScheduler from ${contracts.FlowTransactionScheduler}
import FlowTransactionSchedulerUtils from ${contracts.FlowTransactionSchedulerUtils}
import FlowToken from ${contracts.FlowToken}
import FungibleToken from ${contracts.FungibleToken}
import FlowFees from ${feeContracts.FlowFees}
import FlowStorageFees from ${feeContracts.FlowStorageFees}
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
        // - Cadence-only swaps (IncrementFi): 400-500
        // - EVM swaps (UniswapV3): 2000 (reduced from 5000 based on flow-dca repo findings)
        // DCAServiceEVM always uses EVM swaps
        let executionEffort: UInt64 = 2000
        // Use Low priority for cheaper fees (proven to work by flow-dca repo)
        let priority = FlowTransactionScheduler.Priority.Low

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

        // Calculate fees manually (more reliable for Low priority than estimate())
        // This pattern is from flow-dca repo which successfully uses Low priority
        let baseFee = FlowFees.computeFees(
            inclusionEffort: 1.0,
            executionEffort: UFix64(executionEffort) / 100000000.0
        )

        // Scale by priority multiplier from scheduler config
        let priorityMultipliers = FlowTransactionScheduler.getConfig().priorityFeeMultipliers
        let scaledExecutionFee = baseFee * priorityMultipliers[priority]!

        // Estimate storage fee (data is small, ~1KB)
        let dataSizeMB = 0.001
        let storageFee = FlowStorageFees.storageCapacityToFlow(dataSizeMB)

        // Total fee with inclusion fee
        let feeEstimateCalc = scaledExecutionFee + storageFee + 0.00001

        // Apply 5% buffer, cap at 10.0 FLOW
        var feeAmount = feeEstimateCalc * 1.05
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

// Helper to execute transaction with retry on sequence number errors
const executeWithRetry = async (
  mutateConfig: any,
  maxRetries: number = 3
): Promise<{ txId: string; result: any }> => {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Small delay between retries to let sequence number update
      if (attempt > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        console.log(`Retry attempt ${attempt}/${maxRetries}`);
      }

      const txId = await fcl.mutate(mutateConfig);
      const result = await fcl.tx(txId).onceSealed();

      return { txId, result };
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || "";

      // Check if it's a sequence number error (worth retrying)
      if (errorMsg.includes("sequence number") || errorMsg.includes("1007")) {
        console.warn(`Sequence number error on attempt ${attempt}, will retry...`);
        continue;
      }

      // For other errors, don't retry
      throw error;
    }
  }

  throw lastError;
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

      const { txId, result } = await executeWithRetry({
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

    if (action === "pausePlan") {
      if (!params.planId) {
        return NextResponse.json(
          { success: false, error: "Missing planId parameter" },
          { status: 400 }
        );
      }

      const pausePlanTx = `
import DCAServiceEVM from ${config.contracts.DCAServiceEVM}

transaction(planId: UInt64) {
    prepare(signer: auth(Storage) &Account) {}

    execute {
        DCAServiceEVM.pausePlan(planId: planId)
        log("Paused plan ".concat(planId.toString()))
    }
}
`;

      const { txId, result } = await executeWithRetry({
        cadence: pausePlanTx,
        args: (arg: any, t: any) => [
          arg(params.planId.toString(), t.UInt64),
        ],
        proposer: serviceSigner as any,
        payer: serviceSigner as any,
        authorizations: [serviceSigner as any],
        limit: 9999,
      });

      if (result.errorMessage) {
        return NextResponse.json(
          { success: false, txId, error: result.errorMessage },
          { status: 500 }
        );
      }

      console.log("Plan paused:", { txId, planId: params.planId, network: config.network });
      return NextResponse.json({ success: true, txId });
    }

    if (action === "resumePlan") {
      if (!params.planId) {
        return NextResponse.json(
          { success: false, error: "Missing planId parameter" },
          { status: 400 }
        );
      }

      const delaySeconds = params.delaySeconds || 60.0;

      const resumePlanTx = `
import DCAServiceEVM from ${config.contracts.DCAServiceEVM}

transaction(planId: UInt64, delaySeconds: UFix64?) {
    prepare(signer: auth(Storage) &Account) {}

    execute {
        let nextExecutionTime: UFix64? = delaySeconds != nil
            ? getCurrentBlock().timestamp + delaySeconds!
            : nil

        DCAServiceEVM.resumePlan(planId: planId, nextExecTime: nextExecutionTime)
        log("Resumed plan ".concat(planId.toString()))
    }
}
`;

      const { txId, result } = await executeWithRetry({
        cadence: resumePlanTx,
        args: (arg: any, t: any) => [
          arg(params.planId.toString(), t.UInt64),
          arg(delaySeconds.toFixed(1), t.Optional(t.UFix64)),
        ],
        proposer: serviceSigner as any,
        payer: serviceSigner as any,
        authorizations: [serviceSigner as any],
        limit: 9999,
      });

      if (result.errorMessage) {
        return NextResponse.json(
          { success: false, txId, error: result.errorMessage },
          { status: 500 }
        );
      }

      console.log("Plan resumed:", { txId, planId: params.planId, network: config.network });
      return NextResponse.json({ success: true, txId });
    }

    if (action === "schedulePlan") {
      if (!params.planId) {
        return NextResponse.json(
          { success: false, error: "Missing planId parameter" },
          { status: 400 }
        );
      }

      // Calculate total fee needed for all executions
      // With Low priority and executionEffort: 2000 (based on flow-dca repo findings):
      // - Fee is significantly lower than Medium priority
      // - Estimated ~0.05-0.1 FLOW per execution
      // - Using 0.15 FLOW per execution as safety buffer
      const maxExecutions = params.maxExecutions || 10;
      const feePerExecution = 0.15; // Low priority fee with buffer
      const totalFeeAmount = (feePerExecution * maxExecutions).toFixed(8);

      console.log("Scheduling plan with fees:", {
        planId: params.planId,
        maxExecutions,
        totalFeeAmount,
        network: config.network,
      });

      // Get fee contract addresses for the network
      const feeContracts = FEE_CONTRACTS[config.network];

      const { txId, result } = await executeWithRetry({
        cadence: getSchedulePlanTx(config.contracts, feeContracts),
        args: (arg: any, t: any) => [
          arg(params.planId.toString(), t.UInt64),
          arg(totalFeeAmount, t.UFix64),
        ],
        proposer: serviceSigner as any,
        payer: serviceSigner as any,
        authorizations: [serviceSigner as any],
        limit: 9999,
      });

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
