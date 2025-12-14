/**
 * Transaction Relay for Sponsored Transactions
 *
 * Calls the backend API which submits Cadence transactions using
 * a service account. This allows Metamask users to create DCA plans
 * without needing a Flow wallet - the service account pays for gas.
 *
 * Key insight: createPlan is validated on-chain.
 * Security comes from allowance checks, not from who submits.
 */

export interface CreatePlanParams {
  userEVMAddress: string;
  sourceToken: string;
  targetToken: string;
  amountPerInterval: string; // Wei as string
  intervalSeconds: number;
  maxSlippageBps: number;
  maxExecutions: number | null;
  feeTier: number;
  firstExecutionDelay: number;
}

/**
 * Create a DCA plan via sponsored transaction (backend API)
 *
 * This is used when a Metamask user has already approved the shared COA
 * to spend their tokens. The backend submits the Cadence transaction
 * using a service account that pays for gas.
 */
export async function createDCAPlanSponsored(
  params: CreatePlanParams
): Promise<{ success: boolean; txId?: string; planId?: number; error?: string }> {
  try {
    const response = await fetch("/api/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createPlan", params }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || `HTTP error ${response.status}`,
      };
    }

    return result;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to create DCA plan",
    };
  }
}

/**
 * Schedule a DCA plan for autonomous execution (backend API)
 *
 * After creating a plan, this registers it with FlowTransactionScheduler
 * so it executes automatically at the configured intervals.
 *
 * @param planId - The plan ID to schedule
 * @param maxExecutions - Number of executions to fund fees for (default 10)
 */
export async function scheduleDCAPlan(
  planId: number,
  maxExecutions: number = 10
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const response = await fetch("/api/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "schedulePlan", params: { planId, maxExecutions } }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || `HTTP error ${response.status}`,
      };
    }

    return result;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to schedule DCA plan",
    };
  }
}

/**
 * Create and schedule a DCA plan in one operation
 *
 * Convenience function that creates a plan and immediately schedules it.
 * Returns the planId on success.
 */
export async function createAndScheduleDCAPlan(
  params: CreatePlanParams
): Promise<{ success: boolean; txId?: string; planId?: number; error?: string }> {
  // Step 1: Create the plan
  const createResult = await createDCAPlanSponsored(params);

  if (!createResult.success || createResult.planId == null) {
    return {
      success: false,
      error: createResult.error || "Failed to create plan - no planId returned",
    };
  }

  // Step 2: Schedule the plan
  // Pass maxExecutions to fund the fee vault appropriately
  const maxExecs = params.maxExecutions || 10; // Default to 10 if unlimited
  const scheduleResult = await scheduleDCAPlan(createResult.planId, maxExecs);

  if (!scheduleResult.success) {
    return {
      success: false,
      planId: createResult.planId,
      error: `Plan created (ID: ${createResult.planId}) but scheduling failed: ${scheduleResult.error}`,
    };
  }

  return {
    success: true,
    txId: scheduleResult.txId,
    planId: createResult.planId,
  };
}

// ERC-20 ABI for approve, allowance, and balanceOf functions
export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
