"use client";

import { useState } from "react";

export function CreateDCAPlan() {
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState("7");
  const [slippage, setSlippage] = useState("1");
  const [maxExecutions, setMaxExecutions] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      // TODO: Integrate with Flow transactions
      console.log("Creating DCA plan:", {
        amount,
        interval,
        slippage,
        maxExecutions,
      });

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));

      alert("DCA Plan created successfully!");
      // Reset form
      setAmount("");
      setMaxExecutions("");
    } catch (error) {
      console.error("Error creating plan:", error);
      alert("Failed to create DCA plan");
    } finally {
      setIsCreating(false);
    }
  };

  const intervalOptions = [
    { value: "1", label: "Daily", seconds: 86400 },
    { value: "7", label: "Weekly", seconds: 604800 },
    { value: "14", label: "Bi-weekly", seconds: 1209600 },
    { value: "30", label: "Monthly", seconds: 2592000 },
  ];

  const estimatedDuration = maxExecutions
    ? `~${Math.ceil(
        (parseInt(maxExecutions) * parseInt(interval)) / 30
      )} months`
    : "Unlimited";

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-[#00EF8B] to-[#7FFFC4] bg-clip-text text-transparent">
            Create Your DCA Strategy
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Automate your Flow investments with dollar-cost averaging
          </p>
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <label
            htmlFor="amount"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Investment Amount (FLOW)
          </label>
          <div className="relative">
            <input
              id="amount"
              type="number"
              step="0.01"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g., 10.00"
              required
              className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl focus:border-[#00EF8B] focus:ring-2 focus:ring-[#00EF8B]/20 outline-none text-lg font-mono"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
              FLOW
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Minimum: 1 FLOW per investment
          </p>
        </div>

        {/* Interval Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Investment Frequency
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {intervalOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setInterval(option.value)}
                className={`px-4 py-3 rounded-xl font-medium transition-all ${
                  interval === option.value
                    ? "bg-[#00EF8B] text-black shadow-lg shadow-[#00EF8B]/30"
                    : "bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] hover:border-[#00EF8B] text-gray-700 dark:text-gray-300"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Max Executions */}
        <div className="space-y-2">
          <label
            htmlFor="maxExecutions"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Maximum Executions (Optional)
          </label>
          <input
            id="maxExecutions"
            type="number"
            min="1"
            value={maxExecutions}
            onChange={(e) => setMaxExecutions(e.target.value)}
            placeholder="Leave empty for unlimited"
            className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl focus:border-[#00EF8B] focus:ring-2 focus:ring-[#00EF8B]/20 outline-none"
          />
          <p className="text-xs text-gray-500">
            Your plan will run {estimatedDuration}
          </p>
        </div>

        {/* Slippage Tolerance */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="slippage"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Slippage Tolerance
            </label>
            <span className="text-sm font-mono text-[#00EF8B]">
              {slippage}%
            </span>
          </div>
          <input
            id="slippage"
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="w-full h-2 bg-gray-200 dark:bg-[#2a2a2a] rounded-lg appearance-none cursor-pointer accent-[#00EF8B]"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0.1%</span>
            <span>5%</span>
          </div>
        </div>

        {/* Summary Card */}
        {amount && (
          <div className="bg-gradient-to-br from-[#00EF8B]/10 to-[#7FFFC4]/10 dark:from-[#00EF8B]/20 dark:to-[#7FFFC4]/20 border-2 border-[#00EF8B]/30 rounded-xl p-6 space-y-3">
            <h3 className="font-semibold text-lg mb-4">Plan Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Per Investment
                </p>
                <p className="text-xl font-bold font-mono">{amount} FLOW</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Frequency
                </p>
                <p className="text-xl font-bold">
                  {intervalOptions.find((o) => o.value === interval)?.label}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Total Investment
                </p>
                <p className="text-xl font-bold font-mono">
                  {maxExecutions
                    ? `${(parseFloat(amount) * parseInt(maxExecutions)).toFixed(2)} FLOW`
                    : "Unlimited"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Duration
                </p>
                <p className="text-xl font-bold">{estimatedDuration}</p>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isCreating || !amount}
          className="w-full bg-[#00EF8B] hover:bg-[#00D57A] disabled:bg-gray-300 disabled:cursor-not-allowed text-black font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#00EF8B]/30 disabled:shadow-none"
        >
          {isCreating ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
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
              Creating Plan...
            </span>
          ) : (
            "Create DCA Plan"
          )}
        </button>

        {/* Info Notice */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex gap-3">
            <svg
              className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <p className="font-medium mb-1">How it works:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>
                  Your DCA plan executes automatically via Flow Scheduled
                  Transactions
                </li>
                <li>
                  FLOW tokens are swapped to your target token at each interval
                </li>
                <li>Track your average cost and total investment over time</li>
                <li>Pause or cancel your plan anytime</li>
              </ul>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
