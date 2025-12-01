"use client";

import { useState, useEffect } from "react";
import * as fcl from "@onflow/fcl";
import { useTransaction } from "@/hooks/use-transaction";
import {
  SETUP_CONTROLLER_TX,
  CREATE_PLAN_TX,
  CHECK_CONTROLLER_SCRIPT,
  GET_FLOW_SWAPPABLE_TOKENS_SCRIPT,
} from "@/lib/cadence-transactions";
import { TransactionStatus } from "@/config/fcl-config";
import type { TokenInfo } from "@/lib/token-metadata";
import {
  sortTokensByLiquidity,
  filterByMinLiquidity,
  getTokenDisplayName,
  getTokenColor,
} from "@/lib/token-metadata";

export function CreateDCAPlan() {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState("168"); // Default to Weekly
  const [slippage, setSlippage] = useState("1");
  const [maxExecutions, setMaxExecutions] = useState("");
  const [controllerConfigured, setControllerConfigured] = useState(false);
  const [checkingController, setCheckingController] = useState(false);

  // Token selection state
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);

  const {
    status: txStatus,
    txId,
    error: txError,
    executeTransaction,
    resetTransaction,
    isLoading: txLoading,
    isSuccess: txSuccess,
  } = useTransaction();

  // Subscribe to user authentication
  useEffect(() => {
    const unsubscribe = fcl.currentUser.subscribe((currentUser) => {
      if (currentUser && currentUser.addr) {
        setUserAddress(currentUser.addr);
        checkController(currentUser.addr);
      } else {
        setUserAddress(null);
        setControllerConfigured(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch available tokens from IncrementFi
  useEffect(() => {
    fetchAvailableTokens();
  }, []);

  const fetchAvailableTokens = async () => {
    setLoadingTokens(true);
    setTokensError(null);
    try {
      const tokens: TokenInfo[] = await fcl.query({
        cadence: GET_FLOW_SWAPPABLE_TOKENS_SCRIPT,
        args: (arg, t) => [],
      });

      console.log("Fetched tokens from IncrementFi:", tokens);

      // Filter tokens with at least 100 FLOW liquidity and sort by liquidity
      const filteredTokens = filterByMinLiquidity(tokens, 100);
      const sortedTokens = sortTokensByLiquidity(filteredTokens);

      setAvailableTokens(sortedTokens);

      // Auto-select first token if available
      if (sortedTokens.length > 0) {
        setSelectedToken(sortedTokens[0]);
      }
    } catch (error: any) {
      console.error("Error fetching tokens:", error);

      // Fallback to mock token list for emulator or when IncrementFi is unavailable
      const fallbackTokens: TokenInfo[] = [
        {
          symbol: "USDC",
          tokenAddress: "b19436aae4d94622",
          tokenContract: "FiatToken",
          tokenIdentifier: "A.b19436aae4d94622.FiatToken.Vault",
          pairAddress: "0xf8d6e0586b0a20c7",
          flowReserve: "10000.0",
          tokenReserve: "25000.0",
          isStable: true,
        },
        {
          symbol: "USDT",
          tokenAddress: "cfdd90d4a00f7b5b",
          tokenContract: "TeleportedTetherToken",
          tokenIdentifier: "A.cfdd90d4a00f7b5b.TeleportedTetherToken.Vault",
          pairAddress: "0xf8d6e0586b0a20c7",
          flowReserve: "8000.0",
          tokenReserve: "20000.0",
          isStable: true,
        },
        {
          symbol: "stFLOW",
          tokenAddress: "d6f80565193ad727",
          tokenContract: "stFlowToken",
          tokenIdentifier: "A.d6f80565193ad727.stFlowToken.Vault",
          pairAddress: "0xf8d6e0586b0a20c7",
          flowReserve: "5000.0",
          tokenReserve: "4800.0",
          isStable: false,
        },
      ];

      console.log("Using fallback token list (IncrementFi not available on this network)");
      setAvailableTokens(fallbackTokens);
      setSelectedToken(fallbackTokens[0]);
      setTokensError(null); // Don't show error, fallback is intentional
    } finally {
      setLoadingTokens(false);
    }
  };

  const checkController = async (address: string) => {
    setCheckingController(true);
    try {
      const result = await fcl.query({
        cadence: CHECK_CONTROLLER_SCRIPT,
        args: (arg, t) => [arg(address, t.Address)],
      });
      setControllerConfigured(result);
    } catch (error) {
      console.error("Error checking controller:", error);
      setControllerConfigured(false);
    } finally {
      setCheckingController(false);
    }
  };

  const setupController = async () => {
    if (!userAddress) {
      alert("Please connect your wallet first");
      return;
    }

    const result = await executeTransaction(
      SETUP_CONTROLLER_TX,
      (arg, t) => [],
      1000
    );

    if (result.success) {
      setControllerConfigured(true);
      setTimeout(() => resetTransaction(), 3000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userAddress) {
      alert("Please connect your wallet first");
      return;
    }

    if (!controllerConfigured) {
      alert("Please setup your DCA controller first");
      return;
    }

    // Convert slippage percentage to basis points (1% = 100 bps)
    const slippageBps = Math.floor(parseFloat(slippage) * 100);

    // First execution delay: 5 minutes from now (300 seconds)
    const firstExecutionDelay = 300;

    const result = await executeTransaction(
      CREATE_PLAN_TX,
      (arg, t) => [
        arg(amount, t.UFix64),
        arg(interval, t.UInt64),
        arg(slippageBps.toString(), t.UInt64),
        arg(maxExecutions || null, t.Optional(t.UInt64)),
        arg(firstExecutionDelay.toString(), t.UInt64),
      ],
      1000
    );

    if (result.success) {
      // Reset form after success
      setTimeout(() => {
        setAmount("");
        setMaxExecutions("");
        resetTransaction();
      }, 3000);
    }
  };

  const intervalOptions = [
    { value: "0.0166", label: "Minutely", seconds: 60 },
    { value: "1", label: "Hourly", seconds: 3600 },
    { value: "4", label: "Every 4 Hours", seconds: 14400 },
    { value: "12", label: "Every 12 Hours", seconds: 43200 },
    { value: "24", label: "Daily", seconds: 86400 },
    { value: "168", label: "Weekly", seconds: 604800 },
    { value: "336", label: "Bi-weekly", seconds: 1209600 },
    { value: "720", label: "Monthly", seconds: 2592000 },
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

        {/* Target Token Selection */}
        <div className="space-y-2">
          <label
            htmlFor="targetToken"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Target Asset
          </label>

          {loadingTokens ? (
            <div className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl flex items-center gap-2">
              <svg
                className="animate-spin h-5 w-5 text-[#00EF8B]"
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
              <span className="text-sm text-gray-500">
                Loading available tokens...
              </span>
            </div>
          ) : tokensError ? (
            <div className="w-full px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {tokensError}
              </p>
            </div>
          ) : availableTokens.length === 0 ? (
            <div className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl">
              <p className="text-sm text-gray-500">
                No tokens available. Please check your network connection.
              </p>
            </div>
          ) : (
            <select
              id="targetToken"
              value={selectedToken?.tokenIdentifier || ""}
              onChange={(e) => {
                const token = availableTokens.find(
                  (t) => t.tokenIdentifier === e.target.value
                );
                setSelectedToken(token || null);
              }}
              className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl focus:border-[#00EF8B] focus:ring-2 focus:ring-[#00EF8B]/20 outline-none cursor-pointer"
            >
              {availableTokens.map((token) => (
                <option key={token.tokenIdentifier} value={token.tokenIdentifier}>
                  {getTokenDisplayName(token)}
                </option>
              ))}
            </select>
          )}

          <p className="text-xs text-gray-500">
            DCA from FLOW into your chosen token via IncrementFi
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
              className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl focus:border-[#00EF8B] focus:ring-2 focus:ring-[#00EF8B]/20 outline-none text-lg font-mono cursor-text"
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
                className={`px-4 py-3 rounded-xl font-medium transition-all cursor-pointer ${
                  interval === option.value
                    ? "bg-[#00EF8B] text-black shadow-lg shadow-[#00EF8B]/30"
                    : "bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] hover:border-[#00EF8B] text-gray-700 dark:text-gray-300"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            More frequent = higher fees but faster accumulation
          </p>
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
            className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl focus:border-[#00EF8B] focus:ring-2 focus:ring-[#00EF8B]/20 outline-none cursor-text"
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

        {/* Controller Setup Notice */}
        {userAddress && !controllerConfigured && !checkingController && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
                  Setup Required
                </h4>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                  Before creating your first DCA plan, you need to setup your
                  DCA controller. This is a one-time setup.
                </p>
                <button
                  onClick={setupController}
                  disabled={txLoading}
                  className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {txLoading ? "Setting up..." : "Setup Controller Now"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Status */}
        {txStatus !== TransactionStatus.IDLE && (
          <div
            className={`border-2 rounded-xl p-4 ${
              txStatus === TransactionStatus.SEALED
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                : txStatus === TransactionStatus.ERROR
                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            }`}
          >
            <div className="flex items-start gap-3">
              {txLoading && (
                <svg
                  className="animate-spin h-6 w-6 text-blue-600"
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
              )}
              {txSuccess && (
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {txStatus === TransactionStatus.ERROR && (
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
              <div className="flex-1">
                <h4 className="font-semibold mb-1">
                  {txLoading && "Processing Transaction..."}
                  {txSuccess && "Success!"}
                  {txStatus === TransactionStatus.ERROR && "Transaction Failed"}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {txStatus === TransactionStatus.PENDING &&
                    "Waiting for approval..."}
                  {txStatus === TransactionStatus.EXECUTING &&
                    "Executing transaction..."}
                  {txStatus === TransactionStatus.SEALING &&
                    "Sealing transaction..."}
                  {txSuccess && "Your DCA plan has been created successfully!"}
                  {txStatus === TransactionStatus.ERROR && txError}
                </p>
                {txId && (
                  <p className="text-xs font-mono text-gray-500 mt-2">
                    TX: {txId}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={
            txLoading ||
            !amount ||
            !userAddress ||
            !controllerConfigured ||
            checkingController
          }
          className="w-full bg-[#00EF8B] hover:bg-[#00D57A] disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-black dark:disabled:text-gray-400 font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#00EF8B]/30 disabled:shadow-none disabled:transform-none cursor-pointer"
        >
          {!userAddress
            ? "Connect Wallet to Continue"
            : checkingController
            ? "Checking setup..."
            : !controllerConfigured
            ? "Setup Required First"
            : txLoading
            ? "Creating Plan..."
            : "Create DCA Plan"}
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
