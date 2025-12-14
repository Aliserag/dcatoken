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

// Get network from environment (server-side)
const NETWORK = process.env.NEXT_PUBLIC_FLOW_NETWORK || "mainnet";

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
    DCAServiceEVM: "0x4a22e2fce83584aa",
    DCAHandlerEVMV4: "0x4a22e2fce83584aa",
    FlowToken: "0x7e60df042a9c0868",
    FungibleToken: "0x9a0766d93b6608b7",
    FlowTransactionScheduler: "0x8c5303eaa26202d6",
    FlowTransactionSchedulerUtils: "0x8c5303eaa26202d6",
    EVM: "0x8c5303eaa26202d6",
  },
};

// Get contracts for current network
const CONTRACTS = CONTRACTS_BY_NETWORK[NETWORK as keyof typeof CONTRACTS_BY_NETWORK] || CONTRACTS_BY_NETWORK.mainnet;

// Network-specific service account configuration
const SERVICE_CONFIG = {
  mainnet: {
    address: "0xca7ee55e4fc3251a",
    keyId: 1,
    privateKeyEnv: "PRIVATE_KEY_MAINNET",
  },
  testnet: {
    address: "0x4a22e2fce83584aa",
    keyId: 1,  // Key index 1 (key 0 was revoked)
    privateKeyEnv: "PRIVATE_KEY_TESTNET",
  },
};

// Get service account config for current network
const serviceConfig = SERVICE_CONFIG[NETWORK as keyof typeof SERVICE_CONFIG] || SERVICE_CONFIG.mainnet;
const SERVICE_ADDRESS = process.env.SERVICE_ACCOUNT_ADDRESS || serviceConfig.address;
const SERVICE_PRIVATE_KEY = process.env.SERVICE_PRIVATE_KEY || process.env[serviceConfig.privateKeyEnv];
const SERVICE_KEY_ID = parseInt(process.env.SERVICE_KEY_ID || serviceConfig.keyId.toString());

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

// Service account authorization function
// Returns an authorization object that FCL uses to sign transactions
const serviceSigner = async (account: any): Promise<any> => {
  return {
    ...account,
    tempId: `${SERVICE_ADDRESS}-${SERVICE_KEY_ID}`,
    addr: fcl.sansPrefix(SERVICE_ADDRESS),
    keyId: SERVICE_KEY_ID,
    signingFunction: async (signable: any) => ({
      addr: fcl.withPrefix(SERVICE_ADDRESS),
      keyId: SERVICE_KEY_ID,
      signature: signWithKey(SERVICE_PRIVATE_KEY!, signable.message),
    }),
  };
};

// Cadence transaction to create a DCA plan
const CREATE_PLAN_TX = `
import EVM from ${CONTRACTS.EVM}
import DCAServiceEVM from ${CONTRACTS.DCAServiceEVM}

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

// Cadence transaction to schedule a DCA plan
// This version creates/uses a dedicated fee vault for scheduler fees
const SCHEDULE_PLAN_TX = `
import FlowTransactionScheduler from ${CONTRACTS.FlowTransactionScheduler}
import FlowTransactionSchedulerUtils from ${CONTRACTS.FlowTransactionSchedulerUtils}
import FlowToken from ${CONTRACTS.FlowToken}
import FungibleToken from ${CONTRACTS.FungibleToken}
import DCAHandlerEVMV4 from ${CONTRACTS.DCAHandlerEVMV4}
import DCAServiceEVM from ${CONTRACTS.DCAServiceEVM}

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
        // - EVM swaps (UniswapV3): 3500 (includes bridging overhead)
        // DCAServiceEVM always uses EVM swaps
        let executionEffort: UInt64 = 3500
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
const configureFCL = () => {
  if (NETWORK === "testnet") {
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
  console.log(`Relay API configured for ${NETWORK}`);
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
  // Validate service account configuration
  if (!SERVICE_PRIVATE_KEY) {
    console.error("SERVICE_PRIVATE_KEY not configured");
    return NextResponse.json(
      { success: false, error: "Service account not configured" },
      { status: 500 }
    );
  }

  const { action, params } = await request.json();
  console.log("Relay API called:", { action, params });

  // Configure FCL
  configureFCL();

  try {
    if (action === "createPlan") {
      // Validate required params
      if (!params.userEVMAddress || !params.sourceToken || !params.targetToken) {
        return NextResponse.json(
          { success: false, error: "Missing required parameters" },
          { status: 400 }
        );
      }

      const txId = await fcl.mutate({
        cadence: CREATE_PLAN_TX,
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
      console.log("Plan created:", { txId, planId, events: result.events });

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
      // FlowTransactionScheduler.estimate() with executionEffort: 3500 returns ~0.7 FLOW per execution
      // We add 20% buffer to ensure sufficient funds even with fee fluctuations
      // maxExecutions from params, default to 10 if not provided
      const maxExecutions = params.maxExecutions || 10;
      const feePerExecution = 0.85; // ~0.7 FLOW estimate + 20% buffer for executionEffort: 3500
      const totalFeeAmount = (feePerExecution * maxExecutions).toFixed(8);

      console.log("Scheduling plan with fees:", { planId: params.planId, maxExecutions, totalFeeAmount });

      const txId = await fcl.mutate({
        cadence: SCHEDULE_PLAN_TX,
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

      console.log("Plan scheduled:", { txId, planId: params.planId });
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
