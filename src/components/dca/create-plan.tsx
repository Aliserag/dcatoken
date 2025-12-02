"use client";

import { useState, useEffect } from "react";
import * as fcl from "@onflow/fcl";
import { useTransaction } from "@/hooks/use-transaction";
import {
  SETUP_CONTROLLER_TX,
  CREATE_PLAN_TX,
  CHECK_CONTROLLER_SCRIPT,
  GET_FLOW_SWAPPABLE_TOKENS_SCRIPT,
  GET_TOKEN_BALANCE_SCRIPT,
  INIT_DCA_HANDLER_TX,
  FUND_AND_SCHEDULE_PLAN_TX,
} from "@/lib/cadence-transactions";
import { TransactionStatus } from "@/config/fcl-config";
import type { TokenInfo } from "@/lib/token-metadata";
import {
  sortTokensByLiquidity,
  filterByMinLiquidity,
  getTokenDisplayName,
  getTokenColor,
  getTokenLogoUrl,
} from "@/lib/token-metadata";

export function CreateDCAPlan() {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [amountPerInterval, setAmountPerInterval] = useState("");
  const [interval, setInterval] = useState("604800"); // Default to Weekly (604800 seconds)
  const [slippage, setSlippage] = useState("1");
  const [maxExecutions, setMaxExecutions] = useState("");
  const [controllerConfigured, setControllerConfigured] = useState(false);
  const [checkingController, setCheckingController] = useState(false);
  const [handlerInitialized, setHandlerInitialized] = useState(false);
  const [checkingHandler, setCheckingHandler] = useState(false);

  // Token selection state
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);

  // Swap direction state (true = FLOW -> Token, false = Token -> FLOW)
  // Default to false for USDC -> FLOW mode
  const [isFlowToToken, setIsFlowToToken] = useState(false);

  // Balance state
  const [flowBalance, setFlowBalance] = useState<string>("0.00");
  const [usdcBalance, setUsdcBalance] = useState<string>("0.00");
  const [loadingBalance, setLoadingBalance] = useState(false);

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
        fetchBalances(currentUser.addr);
      } else {
        setUserAddress(null);
        setControllerConfigured(false);
        setFlowBalance("0.00");
        setUsdcBalance("0.00");
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

      // Whitelist only USDC
      const allowedSymbols = ['USDC'];
      const whitelistedTokens = tokens.filter(
        token => allowedSymbols.includes(token.symbol)
      );

      setAvailableTokens(whitelistedTokens);

      // Auto-select USDC (only option)
      const defaultToken = whitelistedTokens[0];
      if (defaultToken) {
        setSelectedToken(defaultToken);
      }
    } catch (error: any) {
      console.error("Error fetching tokens:", error);
      setTokensError(
        "Unable to load stablecoins from IncrementFi. Please check your network connection or try a different network."
      );
      setAvailableTokens([]);
      setSelectedToken(null);
    } finally {
      setLoadingTokens(false);
    }
  };

  const checkController = async (address: string) => {
    setCheckingController(true);
    try {
      const isConfigured: boolean = await fcl.query({
        cadence: CHECK_CONTROLLER_SCRIPT,
        args: (arg, t) => [arg(address, t.Address)],
      });
      setControllerConfigured(isConfigured);
    } catch (error) {
      console.error("Error checking controller:", error);
      setControllerConfigured(false);
    } finally {
      setCheckingController(false);
    }
  };

  const fetchBalances = async (address: string) => {
    setLoadingBalance(true);
    try {
      // Fetch FLOW balance
      const flowBal = await fcl.query({
        cadence: GET_TOKEN_BALANCE_SCRIPT,
        args: (arg, t) => [arg(address, t.Address), arg("FLOW", t.String)],
      });
      setFlowBalance(parseFloat(flowBal).toFixed(2));

      // Fetch USDC balance
      const usdcBal = await fcl.query({
        cadence: GET_TOKEN_BALANCE_SCRIPT,
        args: (arg, t) => [arg(address, t.Address), arg("USDC", t.String)],
      });
      setUsdcBalance(parseFloat(usdcBal).toFixed(2));
    } catch (error) {
      console.error("Error fetching balances:", error);
      setFlowBalance("0.00");
      setUsdcBalance("0.00");
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleMaxClick = () => {
    if (isFlowToToken) {
      // FLOW -> Token: Use FLOW balance and reserve gas
      const flowBal = parseFloat(flowBalance) || 0;
      const maxAmount = Math.max(0, flowBal - 0.001).toFixed(2);
      setAmountPerInterval(maxAmount);
    } else {
      // Token -> FLOW: Use USDC balance, no gas reservation needed
      const usdcBal = parseFloat(usdcBalance) || 0;
      setAmountPerInterval(usdcBal.toFixed(2));
    }
  };

  const handleSetupController = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeTransaction(SETUP_CONTROLLER_TX, () => [], 500);
    if (userAddress) {
      setTimeout(() => checkController(userAddress), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!controllerConfigured) {
      alert("Please setup DCA Controller first");
      return;
    }

    const slippageBps = Math.floor(parseFloat(slippage) * 100);
    // Set first execution delay to match the selected interval
    // This makes the first execution happen at the same time as subsequent ones
    const firstExecutionDelay = parseInt(interval);

    // Format amount to ensure it has decimal point for UFix64
    // Convert "1" to "1.0", keep "1.5" as "1.5"
    const formattedAmount = parseFloat(amountPerInterval).toFixed(2);

    // interval is already in seconds, pass directly to transaction
    const result = await executeTransaction(
      CREATE_PLAN_TX,
      (arg, t) => [
        arg(formattedAmount, t.UFix64),
        arg(interval, t.UInt64), // interval in seconds
        arg(slippageBps.toString(), t.UInt64),
        arg(maxExecutions || null, t.Optional(t.UInt64)),
        arg(firstExecutionDelay.toString(), t.UInt64),
      ],
      1000
    );

    console.log("CREATE_PLAN_TX result:", result);
    console.log("result.success:", result.success);
    console.log("result.events:", result.events);

    if (result.success) {
      // Auto-schedule the plan after creation
      // Extract plan ID from transaction events
      console.log("Transaction succeeded! Events:", result.events);

      const planCreatedEvent = result.events?.find((e: any) => {
        console.log("Checking event:", e.type);
        return e.type.includes('DCAControllerV2.PlanAddedToController') ||
               e.type.includes('DCAController.PlanAddedToController') ||
               e.type.includes('PlanAddedToController') ||
               e.type.includes('DCAPlanV2.PlanCreated') ||
               e.type.includes('DCAPlan.PlanCreated') ||
               e.type.includes('PlanCreated');
      });

      console.log("Found plan event:", planCreatedEvent);

      if (planCreatedEvent) {
        const planId = planCreatedEvent.data.planId;
        console.log("Plan created with ID:", planId);

        // Check if handler is initialized, if not, initialize it first
        if (!handlerInitialized) {
          setTimeout(async () => {
            // Initialize handler
            const handlerResult = await executeTransaction(
              INIT_DCA_HANDLER_TX,
              (arg, t) => [],
              500
            );

            if (handlerResult.success) {
              setHandlerInitialized(true);

              // Fund and schedule in one transaction
              const numExecutions = maxExecutions || "1000"; // Default to 1000 if unlimited
              const delaySeconds = interval + ".0";

              const fundAndScheduleResult = await executeTransaction(
                FUND_AND_SCHEDULE_PLAN_TX,
                (arg, t) => [
                  arg(planId, t.UInt64),
                  arg(numExecutions, t.UInt64),
                  arg(delaySeconds, t.UFix64),
                  arg("1", t.UInt8), // Priority: Medium
                  arg("5000", t.UInt64) // Execution effort
                ],
                500
              );

              if (fundAndScheduleResult.success) {
                alert(`Plan #${planId} created and scheduled successfully! Autonomous execution will begin in ${intervalOptions.find(o => o.value === interval)?.label.toLowerCase()}.`);
              } else {
                alert(`Handler initialized but funding/scheduling failed. Error: ${fundAndScheduleResult.error}`);
              }
            } else {
              alert(`Handler initialization failed. Error: ${handlerResult.error}`);
            }

            // Reset form
            setAmountPerInterval("");
            setMaxExecutions("");
            resetTransaction();
          }, 1000);
        } else {
          // Handler already initialized, fund and schedule in one transaction
          setTimeout(async () => {
            const delaySeconds = interval + ".0";
            const numExecutions = maxExecutions || "1000"; // Default to 1000 if unlimited

            const fundAndScheduleResult = await executeTransaction(
              FUND_AND_SCHEDULE_PLAN_TX,
              (arg, t) => [
                arg(planId, t.UInt64),
                arg(numExecutions, t.UInt64),
                arg(delaySeconds, t.UFix64),
                arg("1", t.UInt8), // Priority: Medium
                arg("5000", t.UInt64) // Execution effort
              ],
              500
            );

            if (fundAndScheduleResult.success) {
              alert(`Plan #${planId} created and scheduled successfully! Autonomous execution will begin in ${intervalOptions.find(o => o.value === interval)?.label.toLowerCase()}.`);
            } else {
              alert(`Plan #${planId} created but funding/scheduling failed. ${fundAndScheduleResult.error}`);
            }

            // Reset form
            setAmountPerInterval("");
            setMaxExecutions("");
            resetTransaction();
          }, 1000);
        }
      } else {
        // Fallback if we can't get the plan ID
        alert("Plan created successfully! Please schedule it from the dashboard.");
        setTimeout(() => {
          setAmountPerInterval("");
          setMaxExecutions("");
          resetTransaction();
        }, 2000);
      }
    }
  };

  const handleSwapDirection = () => {
    setIsFlowToToken(!isFlowToToken);
  };

  const intervalOptions = [
    { value: "60", label: "Minutely", perLabel: "minute", seconds: 60 },
    { value: "3600", label: "Hourly", perLabel: "hour", seconds: 3600 },
    { value: "14400", label: "Every 4 Hours", perLabel: "4 hours", seconds: 14400 },
    { value: "43200", label: "Every 12 Hours", perLabel: "12 hours", seconds: 43200 },
    { value: "86400", label: "Daily", perLabel: "day", seconds: 86400 },
    { value: "604800", label: "Weekly", perLabel: "week", seconds: 604800 },
  ];

  // Calculate total investment and estimated output
  const selectedInterval =
    intervalOptions.find((opt) => opt.value === interval) || intervalOptions[0];
  const numExecutions = maxExecutions ? parseInt(maxExecutions) : 1;
  const amountNum = parseFloat(amountPerInterval) || 0;
  const totalInvestment = amountNum * numExecutions;

  // Price estimation from pool reserves
  // WARNING: This is a ROUGH estimate based on pool ratios
  // Actual prices may differ significantly due to:
  // - Pool being out of sync with market prices
  // - Swap fees (typically 0.3%)
  // - Price impact from trade size
  // - Possible decimal normalization issues
  // TODO: Use IncrementFi price oracle or quote API for accurate pricing
  const estimatedPrice =
    selectedToken && parseFloat(selectedToken.flowReserve) > 0
      ? parseFloat(selectedToken.tokenReserve) /
        parseFloat(selectedToken.flowReserve)
      : 0;

  // Calculate output based on direction
  const estimatedOutput = isFlowToToken
    ? totalInvestment * estimatedPrice // FLOW -> Token
    : totalInvestment / estimatedPrice; // Token -> FLOW

  // Get display names based on direction
  const fromToken = isFlowToToken ? "FLOW" : (selectedToken?.symbol || "Token");
  const toToken = isFlowToToken ? (selectedToken?.symbol || "Token") : "FLOW";

  return (
    <div className="w-full max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-[#00EF8B] to-[#7FFFC4] bg-clip-text text-transparent">
            Create DCA Strategy
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Automate your investments with dollar-cost averaging
          </p>
        </div>

        {/* Swap-like Interface */}
        <div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-2xl p-6 space-y-3">
          {/* From Token */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">You invest</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  Balance: {loadingBalance ? "..." : isFlowToToken ? flowBalance : usdcBalance} {isFlowToToken ? "FLOW" : "USDC"}
                </span>
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="text-xs font-medium text-[#00EF8B] hover:text-[#00D9FF] transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#0a0a0a] rounded-xl p-4">
              {isFlowToToken ? (
                <>
                  <div className="flex items-center gap-2 min-w-[100px]">
                    {getTokenLogoUrl('FLOW') ? (
                      <img
                        src={getTokenLogoUrl('FLOW')}
                        alt="FLOW"
                        className="w-8 h-8 rounded-full"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00EF8B] to-[#00D9FF] flex items-center justify-center text-white font-bold text-sm" style={{ display: getTokenLogoUrl('FLOW') ? 'none' : 'flex' }}>
                      F
                    </div>
                    <span className="font-semibold">FLOW</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountPerInterval}
                    onChange={(e) => setAmountPerInterval(e.target.value)}
                    placeholder="0.00"
                    required
                    className="flex-1 bg-transparent text-right text-2xl font-semibold outline-none cursor-text"
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-[100px]">
                    {selectedToken && getTokenLogoUrl(selectedToken.symbol) ? (
                      <img
                        src={getTokenLogoUrl(selectedToken.symbol)}
                        alt={selectedToken.symbol}
                        className="w-8 h-8 rounded-full"
                        onError={(e) => {
                          // Fallback to colored circle if logo fails to load
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#26A17B] to-[#1a7a5e] flex items-center justify-center text-white font-bold text-sm">
                        {selectedToken?.symbol.charAt(0) || 'T'}
                      </div>
                    )}
                    <span className="font-semibold">{selectedToken?.symbol || 'USDC'}</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountPerInterval}
                    onChange={(e) => setAmountPerInterval(e.target.value)}
                    placeholder="0.00"
                    required
                    className="flex-1 bg-transparent text-right text-2xl font-semibold outline-none cursor-text"
                  />
                </>
              )}
            </div>
          </div>

          {/* Arrow Separator - Clickable */}
          <div className="flex justify-center -my-1">
            <button
              type="button"
              onClick={handleSwapDirection}
              className="bg-gray-100 dark:bg-[#2a2a2a] hover:bg-[#00EF8B] dark:hover:bg-[#00EF8B] rounded-lg p-2 transition-all cursor-pointer group"
            >
              <svg
                className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-black transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
            </button>
          </div>

          {/* To Token */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">You accumulate</span>
              <span className="text-xs text-gray-500">Est. total output</span>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#0a0a0a] rounded-xl p-4">
              {isFlowToToken ? (
                <>
                  <div className="flex items-center gap-2 min-w-[100px]">
                    {selectedToken && getTokenLogoUrl(selectedToken.symbol) ? (
                      <img
                        src={getTokenLogoUrl(selectedToken.symbol)}
                        alt={selectedToken.symbol}
                        className="w-8 h-8 rounded-full"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#26A17B] to-[#1a7a5e] flex items-center justify-center text-white font-bold text-sm">
                        {selectedToken?.symbol.charAt(0) || 'T'}
                      </div>
                    )}
                    <span className="font-semibold">{selectedToken?.symbol || 'USDC'}</span>
                  </div>
                  <div className="flex-1 text-right text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {estimatedOutput > 0 ? estimatedOutput.toFixed(4) : "0.00"}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-[100px]">
                    {getTokenLogoUrl('FLOW') ? (
                      <img
                        src={getTokenLogoUrl('FLOW')}
                        alt="FLOW"
                        className="w-8 h-8 rounded-full"
                        onError={(e) => {
                          // Fallback to gradient circle if logo fails
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00EF8B] to-[#00D9FF] flex items-center justify-center text-white font-bold text-sm" style={{ display: getTokenLogoUrl('FLOW') ? 'none' : 'flex' }}>
                      F
                    </div>
                    <span className="font-semibold">FLOW</span>
                  </div>
                  <div className="flex-1 text-right text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {estimatedOutput > 0 ? estimatedOutput.toFixed(4) : "0.00"}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Frequency Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Investment Frequency
          </label>
          <div className="grid grid-cols-3 gap-2">
            {intervalOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setInterval(option.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  interval === option.value
                    ? "bg-[#00EF8B] text-black"
                    : "bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] hover:border-[#00EF8B] text-gray-700 dark:text-gray-300"
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
            Number of Investments (Optional)
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
        </div>

        {/* Summary Info */}
        {amountPerInterval && maxExecutions && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Investment per {selectedInterval.perLabel}</span>
                <span className="font-semibold">{amountPerInterval} {fromToken}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Total investments</span>
                <span className="font-semibold">{maxExecutions}×</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-blue-200 dark:border-blue-800">
                <span className="text-gray-900 dark:text-gray-100 font-medium">Total amount</span>
                <span className="font-bold text-[#00EF8B]">{totalInvestment.toFixed(2)} {fromToken}</span>
              </div>
            </div>
          </div>
        )}

        {/* Price Info */}
        {selectedToken && (
          <div className="bg-gray-50 dark:bg-[#0a0a0a] rounded-xl p-4">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Est. pool price</span>
                <span className="font-mono">
                  {isFlowToToken ? (
                    <>1 FLOW ≈ {estimatedPrice.toFixed(4)} {selectedToken.symbol}</>
                  ) : (
                    <>1 {selectedToken.symbol} ≈ {(1 / estimatedPrice).toFixed(4)} FLOW</>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Slippage tolerance</span>
                <span>{slippage}%</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Estimated gas</span>
                <span>~0.001 FLOW per swap</span>
              </div>
              <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                <p className="text-green-600 dark:text-green-500 text-xs">
                  ✓ Stablecoin DCA powered by IncrementFi pools
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Slippage */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <svg
              className="w-4 h-4 transition-transform group-open:rotate-90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Advanced Settings
          </summary>
          <div className="mt-3 space-y-2">
            <label
              htmlFor="slippage"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Max Slippage (%)
            </label>
            <input
              id="slippage"
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl focus:border-[#00EF8B] focus:ring-2 focus:ring-[#00EF8B]/20 outline-none cursor-text"
            />
            <p className="text-xs text-gray-500">
              Transaction will fail if price moves more than {slippage}%
            </p>
          </div>
        </details>

        {/* Submit Button */}
        {!userAddress ? (
          <button
            type="button"
            onClick={() => fcl.authenticate()}
            className="w-full py-4 bg-gradient-to-r from-[#00EF8B] to-[#00D9FF] text-black font-bold rounded-xl hover:shadow-lg hover:shadow-[#00EF8B]/30 transition-all cursor-pointer"
          >
            Connect Wallet
          </button>
        ) : !controllerConfigured ? (
          <button
            type="button"
            onClick={handleSetupController}
            disabled={txLoading || checkingController}
            className="w-full py-4 bg-gradient-to-r from-[#00EF8B] to-[#00D9FF] text-black font-bold rounded-xl hover:shadow-lg hover:shadow-[#00EF8B]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {checkingController
              ? "Checking..."
              : txLoading
              ? "Setting up..."
              : "Setup DCA Controller"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={txLoading || !amountPerInterval || !selectedToken}
            className="w-full py-4 bg-gradient-to-r from-[#00EF8B] to-[#00D9FF] text-black font-bold rounded-xl hover:shadow-lg hover:shadow-[#00EF8B]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {txLoading ? "Creating Strategy..." : "Create DCA Strategy"}
          </button>
        )}

        {/* Transaction Status */}
        {txStatus !== TransactionStatus.IDLE && (
          <div
            className={`p-4 rounded-xl ${
              txStatus === TransactionStatus.ERROR
                ? "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
                : txStatus === TransactionStatus.SEALED
                ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                : "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200"
            }`}
          >
            <p className="font-medium">
              {txStatus === TransactionStatus.PENDING && "Awaiting approval..."}
              {txStatus === TransactionStatus.EXECUTING && "Processing transaction..."}
              {txStatus === TransactionStatus.SEALING && "Finalizing on blockchain..."}
              {txStatus === TransactionStatus.SEALED && "✓ Strategy created successfully!"}
              {txStatus === TransactionStatus.ERROR && `Error: ${txError}`}
            </p>
            {txId && (
              <p className="text-sm mt-1 font-mono">
                Transaction ID: {txId.slice(0, 8)}...
              </p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
