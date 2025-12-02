"use client";

import { useState, useEffect } from "react";
import * as fcl from "@onflow/fcl";
import { GET_ALL_PLANS_SCRIPT, PAUSE_PLAN_TX, RESUME_PLAN_TX, INIT_DCA_HANDLER_TX, SCHEDULE_DCA_PLAN_TX, FUND_FEE_VAULT_TX } from "@/lib/cadence-transactions";
import { useTransaction } from "@/hooks/use-transaction";
import { useFlowPrice } from "@/hooks/use-flow-price";

interface DCAPlan {
  id: number;
  amount: string;
  frequency: string;
  totalInvested: string;
  totalAcquired: string;
  avgPrice: string;
  executionCount: number;
  maxExecutions: number | null;
  status: "active" | "paused" | "completed";
  nextExecution: string;
  createdAt: string;
  intervalSeconds: number;
  isScheduled: boolean; // Track if plan is scheduled with Flow scheduler
}

// Cadence plan structure from blockchain (matches DCAPlan.PlanDetails)
interface CadencePlanDetails {
  id: string; // Changed from planId to match DCAPlan.PlanDetails struct
  sourceTokenType: string;
  targetTokenType: string;
  amountPerInterval: string;
  intervalSeconds: string;
  maxSlippageBps: string;
  maxExecutions: string | null;
  executionCount: string;
  totalSourceInvested: string;
  totalTargetAcquired: string;
  avgExecutionPriceFP128: string;
  avgExecutionPriceDisplay: string;
  status: number;
  nextExecutionTime: string;
  createdAt: string;
  lastExecutedAt: string | null;
}

// Countdown component for next execution
function CountdownTimer({
  targetTimestamp,
  onCountdownComplete,
  planStatus
}: {
  targetTimestamp: string;
  onCountdownComplete?: () => void;
  planStatus?: "active" | "paused" | "completed";
}) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [hasTriggered, setHasTriggered] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const timestampNum = parseFloat(targetTimestamp);

      // Handle invalid timestamps (completed plans, etc.)
      if (isNaN(timestampNum) || timestampNum <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const targetTime = timestampNum * 1000; // Convert to milliseconds
      const now = Date.now();
      const difference = targetTime - now;

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });

        // Trigger callback once when countdown hits zero
        if (!hasTriggered && onCountdownComplete) {
          setHasTriggered(true);
          // Wait 5 seconds after execution time to allow for blockchain confirmation
          setTimeout(() => {
            onCountdownComplete();
          }, 5000);
        }
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / (1000 * 60)) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    // Initial calculation
    calculateTimeLeft();

    // Update every second
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [targetTimestamp, hasTriggered, onCountdownComplete]);

  // Reset trigger when timestamp changes (new execution scheduled)
  useEffect(() => {
    setHasTriggered(false);
  }, [targetTimestamp]);

  if (!timeLeft) return <span className="text-sm text-gray-500">Loading...</span>;

  if (timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0) {
    // Show different message based on plan status
    if (planStatus === "completed") {
      return <span className="text-sm text-gray-500">Plan completed</span>;
    }
    if (planStatus === "paused") {
      return <span className="text-sm text-yellow-500">Paused</span>;
    }
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#00EF8B]">Executing...</span>
        <svg className="animate-spin h-4 w-4 text-[#00EF8B]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-sm font-mono">
      {timeLeft.days > 0 && (
        <>
          <span className="font-bold">{timeLeft.days}</span>
          <span className="text-gray-500">d</span>
        </>
      )}
      <span className="font-bold">{String(timeLeft.hours).padStart(2, '0')}</span>
      <span className="text-gray-500">:</span>
      <span className="font-bold">{String(timeLeft.minutes).padStart(2, '0')}</span>
      <span className="text-gray-500">:</span>
      <span className="font-bold">{String(timeLeft.seconds).padStart(2, '0')}</span>
    </div>
  );
}

export function DCADashboard() {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [plans, setPlans] = useState<DCAPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { executeTransaction } = useTransaction();
  const { priceData } = useFlowPrice();

  // Subscribe to user authentication
  useEffect(() => {
    const unsubscribe = fcl.currentUser.subscribe((currentUser) => {
      if (currentUser && currentUser.addr) {
        setUserAddress(currentUser.addr);
        fetchPlans(currentUser.addr);
      } else {
        setUserAddress(null);
        setPlans([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchPlans = async (address: string) => {
    setLoading(true);
    setError(null);
    try {
      const cadencePlans: CadencePlanDetails[] = await fcl.query({
        cadence: GET_ALL_PLANS_SCRIPT,
        args: (arg, t) => [arg(address, t.Address)],
      });

      console.log("Fetched plans from blockchain:", cadencePlans);

      // Transform Cadence plan data to UI format
      const transformedPlans: DCAPlan[] = cadencePlans.map((cp) => {

        // Convert interval seconds to frequency label
        const intervalDays = Math.floor(
          parseInt(cp.intervalSeconds) / 86400
        );
        let frequency = "Custom";
        if (intervalDays === 1) frequency = "Daily";
        else if (intervalDays === 7) frequency = "Weekly";
        else if (intervalDays === 14) frequency = "Bi-weekly";
        else if (intervalDays === 30) frequency = "Monthly";

        // Convert status number to label (handle both string and number types from FCL)
        const statusNum = typeof cp.status === 'string' ? parseInt(cp.status) : cp.status;
        let status: "active" | "paused" | "completed" = "active";
        if (statusNum === 1) status = "paused";
        else if (statusNum === 2) status = "completed";

        // Parse amounts (they come as strings with decimals)
        const totalInvested = parseFloat(cp.totalSourceInvested).toFixed(2);
        const totalAcquired = parseFloat(cp.totalTargetAcquired).toFixed(2);

        // Calculate average price (FLOW per USDC - how much FLOW you get per USDC spent)
        let avgPrice = "0.00";
        if (parseFloat(totalInvested) > 0) {
          avgPrice = (
            parseFloat(totalAcquired) / parseFloat(totalInvested)
          ).toFixed(4); // Use 4 decimals for better precision
        }

        // Format next execution time (handle invalid/null timestamps for completed plans)
        const nextExecutionTimestamp = parseFloat(cp.nextExecutionTime);
        const nextExecutionTime = !isNaN(nextExecutionTimestamp) && nextExecutionTimestamp > 0
          ? new Date(nextExecutionTimestamp * 1000)
          : null;
        const nextExecution = nextExecutionTime && !isNaN(nextExecutionTime.getTime())
          ? nextExecutionTime.toISOString().split("T")[0]
          : "N/A";

        // Format created at time
        const createdAtTimestamp = parseFloat(cp.createdAt);
        const createdAtTime = !isNaN(createdAtTimestamp) && createdAtTimestamp > 0
          ? new Date(createdAtTimestamp * 1000)
          : new Date();
        const createdAt = !isNaN(createdAtTime.getTime())
          ? createdAtTime.toISOString().split("T")[0]
          : "N/A";

        return {
          id: parseInt(cp.id, 10),
          amount: parseFloat(cp.amountPerInterval).toFixed(2),
          frequency,
          totalInvested,
          totalAcquired,
          avgPrice,
          executionCount: parseInt(cp.executionCount) || 0,
          maxExecutions: cp.maxExecutions
            ? parseInt(cp.maxExecutions)
            : null,
          status,
          // Store timestamp for countdown (use "0" for nil/invalid to trigger completed state)
          // FCL may return null, undefined, "nil", or empty string for optional nil values
          nextExecution: cp.nextExecutionTime ? String(cp.nextExecutionTime) : "0",
          createdAt,
          intervalSeconds: parseInt(cp.intervalSeconds),
          isScheduled: parseInt(cp.executionCount) > 0 || status !== "active", // If executed or not active, assume scheduled
        };
      });

      // Sort plans by most recent first (based on createdAt timestamp)
      const sortedPlans = transformedPlans.sort((a, b) => {
        // Parse createdAt timestamps and sort descending (newest first)
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeB - timeA;
      });

      setPlans(sortedPlans);
    } catch (err: any) {
      console.error("Error fetching plans:", err);
      setError(err.message || "Failed to fetch plans");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-[#00EF8B] text-black";
      case "paused":
        return "bg-yellow-500 text-black";
      case "completed":
        return "bg-gray-500 text-white";
      default:
        return "bg-gray-300 text-black";
    }
  };

  const getProgressPercentage = (plan: DCAPlan) => {
    if (!plan.maxExecutions) return null;
    return Math.round((plan.executionCount / plan.maxExecutions) * 100);
  };

  const handlePausePlan = async (planId: number) => {
    const result = await executeTransaction(
      PAUSE_PLAN_TX,
      (arg, t) => [arg(planId.toString(), t.UInt64)],
      500
    );

    if (result.success && userAddress) {
      // Refresh plans after pausing
      setTimeout(() => fetchPlans(userAddress), 2000);
    }
  };

  const handleResumePlan = async (planId: number) => {
    const result = await executeTransaction(
      RESUME_PLAN_TX,
      (arg, t) => [
        arg(planId.toString(), t.UInt64),
        arg(null, t.Optional(t.UInt64)) // Use nil for delaySeconds (resume with default interval)
      ],
      500
    );

    if (result.success && userAddress) {
      // Refresh plans after resuming
      setTimeout(() => fetchPlans(userAddress), 2000);
    }
  };

  const handleInitializeHandler = async () => {
    const result = await executeTransaction(
      INIT_DCA_HANDLER_TX,
      (arg, t) => [],
      500
    );

    if (result.success) {
      alert("Handler initialized successfully! You can now schedule plans.");
    }
  };

  const handleSchedulePlan = async (planId: number, intervalSeconds: number, maxExecutions: number | null) => {
    // Use interval as delay for first execution
    const delaySeconds = intervalSeconds.toString() + ".0";
    const numExecutions = maxExecutions || 1000; // Default to 1000 if unlimited

    // First, fund the fee vault
    const fundResult = await executeTransaction(
      FUND_FEE_VAULT_TX,
      (arg, t) => [
        arg(planId.toString(), t.UInt64),
        arg(numExecutions.toString(), t.UInt64),
        arg(delaySeconds, t.UFix64),
        arg("1", t.UInt8), // Priority: Medium
        arg("5000", t.UInt64) // Execution effort
      ],
      500
    );

    if (!fundResult.success) {
      alert(`Failed to fund fee vault: ${fundResult.error}. Scheduling may fail.`);
    }

    // Then schedule the plan
    const result = await executeTransaction(
      SCHEDULE_DCA_PLAN_TX,
      (arg, t) => [
        arg(planId.toString(), t.UInt64),
        arg(delaySeconds, t.UFix64),
        arg("1", t.UInt8), // Priority: Medium
        arg("5000", t.UInt64) // Execution effort (max 7500 for Medium priority)
      ],
      500
    );

    if (result.success && userAddress) {
      alert("Plan scheduled successfully! Autonomous execution will begin soon.");
      setTimeout(() => fetchPlans(userAddress), 2000);
    }
  };

  const totalInvested = plans.reduce(
    (sum, plan) => sum + parseFloat(plan.totalInvested),
    0
  );
  const totalAcquired = plans.reduce(
    (sum, plan) => sum + parseFloat(plan.totalAcquired),
    0
  );

  // Calculate total value in USDT for display
  const totalInvestedUSDT = priceData ? totalInvested * priceData.usdt : 0;
  const totalAcquiredUSDT = priceData ? totalAcquired * priceData.usdt : 0;

  // Show all plans (both scheduled and unscheduled)
  // This allows users to see plans that were just created but not yet scheduled
  const displayPlans = plans;
  const scheduledCount = plans.filter(plan => plan.isScheduled).length;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Active Plans
          </p>
          <p className="text-3xl font-bold">{displayPlans.length}</p>
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Total Invested
          </p>
          <p className="text-3xl font-bold font-mono">
            {totalInvested.toFixed(2)}{" "}
            <span className="text-lg text-gray-500">FLOW</span>
          </p>
          {priceData && (
            <p className="text-sm text-gray-500 mt-1">
              ≈ ${totalInvestedUSDT.toFixed(2)} USDT
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Total Acquired
          </p>
          <p className="text-3xl font-bold font-mono">
            {totalAcquired.toFixed(2)}{" "}
            <span className="text-lg text-gray-500">USDC</span>
          </p>
          <p className="text-sm text-gray-500 mt-1">
            ≈ ${totalAcquired.toFixed(2)} USD value
          </p>
        </div>
      </div>

      {/* Plans List */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Your DCA Plans</h2>

        {/* Loading State */}
        {loading && (
          <div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-12 text-center">
            <svg
              className="animate-spin h-12 w-12 mx-auto mb-4 text-[#00EF8B]"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="text-gray-600 dark:text-gray-400">
              Loading your DCA plans...
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
              Error Loading Plans
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && displayPlans.length === 0 && (
          <div className="bg-white dark:bg-[#1a1a1a] border-2 border-dashed border-gray-300 dark:border-[#2a2a2a] rounded-xl p-12 text-center">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="text-xl font-semibold mb-2">No DCA Plans Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Create your first DCA plan to start automating your Flow investments
            </p>
          </div>
        )}

        {/* Plans List */}
        {!loading && !error && displayPlans.length > 0 && (
          <div className="space-y-4">
            {displayPlans.map((plan) => {
              const progress = getProgressPercentage(plan);

              return (
                <div
                  key={`${plan.id}-${plan.createdAt}`}
                  className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6 hover:border-[#00EF8B] transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4">
                      <div className="bg-gradient-to-br from-[#00EF8B]/20 to-[#7FFFC4]/20 p-3 rounded-xl">
                        <svg
                          className="w-8 h-8 text-[#00EF8B]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                          />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Plan #{plan.id}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {plan.amount} FLOW · {plan.frequency}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          plan.status
                        )}`}
                      >
                        {plan.status.toUpperCase()}
                      </span>
                      {plan.status === "active" && !plan.isScheduled && (
                        <button
                          onClick={() => handleSchedulePlan(plan.id, plan.intervalSeconds, plan.maxExecutions)}
                          className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                        >
                          Schedule
                        </button>
                      )}
                      {plan.status === "active" && plan.isScheduled && (
                        <button
                          onClick={() => handlePausePlan(plan.id)}
                          className="px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                        >
                          Pause
                        </button>
                      )}
                      {plan.status === "paused" && (
                        <button
                          onClick={() => handleResumePlan(plan.id)}
                          className="px-4 py-2 bg-[#00EF8B] hover:bg-[#00D9FF] text-black rounded-lg text-sm font-medium transition-colors cursor-pointer"
                        >
                          Resume
                        </button>
                      )}
                      {plan.status === "completed" && (
                        <span className="px-4 py-2 text-sm text-gray-500">
                          Completed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {progress !== null && (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-400">
                          Progress
                        </span>
                        <span className="font-medium">
                          {plan.executionCount} / {plan.maxExecutions}{" "}
                          executions
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-[#2a2a2a] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#00EF8B] to-[#7FFFC4] transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-[#2a2a2a]">
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Total Invested
                      </p>
                      <p className="text-lg font-bold font-mono">
                        {plan.totalInvested}
                        <span className="text-sm text-gray-500 ml-1">
                          FLOW
                        </span>
                      </p>
                      {priceData && parseFloat(plan.totalInvested) > 0 && (
                        <p className="text-xs text-gray-500">
                          ≈ ${(parseFloat(plan.totalInvested) * priceData.usdt).toFixed(2)}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Total Acquired
                      </p>
                      <p className="text-lg font-bold font-mono">
                        {plan.totalAcquired}
                        <span className="text-sm text-gray-500 ml-1">USDC</span>
                      </p>
                      {parseFloat(plan.totalAcquired) > 0 && (
                        <p className="text-xs text-gray-500">
                          ≈ ${parseFloat(plan.totalAcquired).toFixed(2)} USD
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Avg Price
                      </p>
                      <p className="text-lg font-bold font-mono">
                        {plan.avgPrice}
                        <span className="text-sm text-gray-500 ml-1">
                          USDC/FLOW
                        </span>
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Next Execution
                      </p>
                      <CountdownTimer
                        targetTimestamp={plan.nextExecution}
                        planStatus={plan.status}
                        onCountdownComplete={() => {
                          if (userAddress) {
                            fetchPlans(userAddress);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
