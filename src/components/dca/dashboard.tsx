"use client";

import { useState } from "react";

interface DCA Plan {
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

export function DCADashboard() {
  // Mock data - will be replaced with actual blockchain data
  const [plans] = useState<DCA Plan[]>([
    {
      id: 1,
      amount: "10.00",
      frequency: "Weekly",
      totalInvested: "40.00",
      totalAcquired: "125.50",
      avgPrice: "3.14",
      executionCount: 4,
      maxExecutions: 12,
      status: "active",
      nextExecution: "2024-12-03",
      createdAt: "2024-11-01",
    },
    {
      id: 2,
      amount: "5.00",
      frequency: "Daily",
      totalInvested: "155.00",
      totalAcquired: "478.23",
      avgPrice: "3.08",
      executionCount: 31,
      maxExecutions: null,
      status: "active",
      nextExecution: "2024-11-27",
      createdAt: "2024-10-27",
    },
  ]);

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

        {plans.length === 0 ? (
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
        ) : (
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
                      <button className="px-4 py-2 bg-gray-100 dark:bg-[#2a2a2a] hover:bg-gray-200 dark:hover:bg-[#3a3a3a] rounded-lg text-sm font-medium transition-colors">
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
                      <p className="text-lg font-bold">
                        {new Date(plan.nextExecution).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" }
                        )}
                      </p>
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
