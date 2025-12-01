"use client";

import { useState, useEffect } from "react";
import * as fcl from "@onflow/fcl";
import { GET_ALL_PLANS_SCRIPT } from "@/lib/cadence-transactions";

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
}

// Cadence plan structure from blockchain
interface CadencePlanDetails {
  planId: string;
  sourceTokenType: string;
  targetTokenType: string;
  amountPerInterval: string;
  intervalSeconds: string;
  maxSlippageBps: string;
  maxExecutions: string | null;
  executionCount: string;
  totalSourceInvested: string;
  totalTargetAcquired: string;
  weightedAveragePriceFP128: string;
  status: number;
  nextExecutionTime: string;
  createdAt: string;
}

// Countdown component for next execution
function CountdownTimer({ targetTimestamp }: { targetTimestamp: string }) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const targetTime = parseFloat(targetTimestamp) * 1000; // Convert to milliseconds
      const now = Date.now();
      const difference = targetTime - now;

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
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
  }, [targetTimestamp]);

  if (!timeLeft) return <span className="text-sm text-gray-500">Loading...</span>;

  if (timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0) {
    return <span className="text-sm text-[#00EF8B]">Ready to execute</span>;
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

        // Convert status number to label
        let status: "active" | "paused" | "completed" = "active";
        if (cp.status === 1) status = "paused";
        else if (cp.status === 2) status = "completed";

        // Parse amounts (they come as strings with decimals)
        const totalInvested = parseFloat(cp.totalSourceInvested).toFixed(2);
        const totalAcquired = parseFloat(cp.totalTargetAcquired).toFixed(2);

        // Calculate average price from weighted average (simplified for now)
        let avgPrice = "0.00";
        if (parseFloat(totalAcquired) > 0) {
          avgPrice = (
            parseFloat(totalInvested) / parseFloat(totalAcquired)
          ).toFixed(2);
        }

        // Format next execution time
        const nextExecutionTime = new Date(
          parseFloat(cp.nextExecutionTime) * 1000
        );
        const nextExecution = nextExecutionTime.toISOString().split("T")[0];

        // Format created at time
        const createdAtTime = new Date(parseFloat(cp.createdAt) * 1000);
        const createdAt = createdAtTime.toISOString().split("T")[0];

        return {
          id: parseInt(cp.planId) || 0,
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
          nextExecution: cp.nextExecutionTime, // Store timestamp for countdown
          createdAt,
        };
      });

      setPlans(transformedPlans);
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

  const totalInvested = plans.reduce(
    (sum, plan) => sum + parseFloat(plan.totalInvested),
    0
  );
  const totalAcquired = plans.reduce(
    (sum, plan) => sum + parseFloat(plan.totalAcquired),
    0
  );

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Active Plans
          </p>
          <p className="text-3xl font-bold">{plans.length}</p>
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Total Invested
          </p>
          <p className="text-3xl font-bold font-mono">
            {totalInvested.toFixed(2)}{" "}
            <span className="text-lg text-gray-500">FLOW</span>
          </p>
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Total Acquired
          </p>
          <p className="text-3xl font-bold font-mono">
            {totalAcquired.toFixed(2)}{" "}
            <span className="text-lg text-gray-500">Tokens</span>
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
        {!loading && !error && plans.length === 0 && (
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
              Create your first DCA plan to start automating your Flow
              investments
            </p>
          </div>
        )}

        {/* Plans List */}
        {!loading && !error && plans.length > 0 && (
          <div className="space-y-4">
            {plans.map((plan) => {
              const progress = getProgressPercentage(plan);

              return (
                <div
                  key={plan.id}
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
                      <button className="px-4 py-2 bg-gray-100 dark:bg-[#2a2a2a] hover:bg-gray-200 dark:hover:bg-[#3a3a3a] rounded-lg text-sm font-medium transition-colors cursor-pointer">
                        Manage
                      </button>
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
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Total Acquired
                      </p>
                      <p className="text-lg font-bold font-mono">
                        {plan.totalAcquired}
                        <span className="text-sm text-gray-500 ml-1">TKN</span>
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Avg Price
                      </p>
                      <p className="text-lg font-bold font-mono">
                        {plan.avgPrice}
                        <span className="text-sm text-gray-500 ml-1">
                          FLOW
                        </span>
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Next Execution
                      </p>
                      <CountdownTimer targetTimestamp={plan.nextExecution} />
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
