"use client";

import { useState, useEffect } from "react";
import * as fcl from "@onflow/fcl";
import { useTransaction } from "@/hooks/use-transaction";
import {
  SETUP_CONTROLLER_TX_UNIFIED,
  CHECK_CONTROLLER_SCRIPT_UNIFIED,
  GET_FLOW_SWAPPABLE_TOKENS_SCRIPT,
  GET_TOKEN_BALANCE_SCRIPT,
  CREATE_FUND_AND_SCHEDULE_PLAN_TX_UNIFIED,
} from "@/lib/cadence-transactions";
import { TransactionStatus } from "@/config/fcl-config";
import type { TokenInfo } from "@/lib/token-metadata";
import {
  sortTokensByLiquidity,
  filterByMinLiquidity,
  getTokenDisplayName,
  getTokenColor,
  getTokenLogoUrl,
  ALLOWED_TRADING_TOKENS,
} from "@/lib/token-metadata";
import { getTokenPrices, calculateExchangeRate } from "@/lib/price-service";

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

  // Token selection state - independent source and target tokens
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const [sourceToken, setSourceToken] = useState<TokenInfo | null>(null);
  const [targetToken, setTargetToken] = useState<TokenInfo | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);

  // Balance state
  const [flowBalance, setFlowBalance] = useState<string>("0.00");
  const [usdcBalance, setUsdcBalance] = useState<string>("0.00");
  const [usdfBalance, setUsdfBalance] = useState<string>("0.00");
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Price state (from CoinGecko)
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

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
        checkController(currentUser.addr, sourceToken, targetToken);
        fetchBalances(currentUser.addr);
      } else {
        setUserAddress(null);
        setControllerConfigured(false);
        setFlowBalance("0.00");
        setUsdcBalance("0.00");
        setUsdfBalance("0.00");
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch available tokens from IncrementFi
  useEffect(() => {
    fetchAvailableTokens();
  }, []);

  // Re-check controller when token selection changes (V2 vs V3 depends on USDF involvement)
  useEffect(() => {
    if (userAddress) {
      checkController(userAddress, sourceToken, targetToken);
    }
  }, [sourceToken?.symbol, targetToken?.symbol, userAddress]);

  // Fetch real-time prices from CoinGecko
  useEffect(() => {
    const fetchPrices = async () => {
      setLoadingPrices(true);
      try {
        const prices = await getTokenPrices(['FLOW', 'USDC', 'USDT']);
        setTokenPrices(prices);
        console.log('Fetched prices from CoinGecko:', prices);
      } catch (error) {
        console.error('Failed to fetch prices:', error);
      } finally {
        setLoadingPrices(false);
      }
    };

    fetchPrices();
    // Refresh prices every 5 minutes
    const priceInterval = window.setInterval(fetchPrices, 5 * 60 * 1000);
    return () => window.clearInterval(priceInterval);
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

      // Use centralized token whitelist from registry
      const whitelistedTokens = tokens.filter(
        token => ALLOWED_TRADING_TOKENS.includes(token.symbol)
      );

      // Add FLOW token (always available as native token)
      const flowToken: TokenInfo = {
        symbol: 'FLOW',
        tokenAddress: '0x1654653399040a61',
        tokenContract: 'FlowToken',
        tokenIdentifier: 'A.1654653399040a61.FlowToken.Vault',
        pairAddress: '',
        flowReserve: '0',
        tokenReserve: '0',
        isStable: false,
      };

      // Add USDF manually since it uses EVM DEXes (not IncrementFi)
      const usdfToken: TokenInfo = {
        symbol: 'USDF',
        tokenAddress: '0x1e4aa0b87d10b141',
        tokenContract: 'EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed',
        tokenIdentifier: 'A.1e4aa0b87d10b141.EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed.Vault',
        pairAddress: '',
        flowReserve: '0',
        tokenReserve: '0',
        isStable: true,
      };

      // Build complete token list: FLOW first, then stablecoins
      const allTokens: TokenInfo[] = [flowToken];

      // Add whitelisted tokens from IncrementFi
      whitelistedTokens.forEach(token => {
        if (!allTokens.find(t => t.symbol === token.symbol)) {
          allTokens.push(token);
        }
      });

      // Add USDF if not already present
      if (ALLOWED_TRADING_TOKENS.includes('USDF') && !allTokens.find(t => t.symbol === 'USDF')) {
        allTokens.push(usdfToken);
      }

      setAvailableTokens(allTokens);

      // Set default: USDC → FLOW (most common DCA pattern)
      const defaultSource = allTokens.find(t => t.symbol === 'USDC') || allTokens[1];
      const defaultTarget = allTokens.find(t => t.symbol === 'FLOW') || allTokens[0];

      if (defaultSource) setSourceToken(defaultSource);
      if (defaultTarget) setTargetToken(defaultTarget);
    } catch (error: any) {
      console.error("Error fetching tokens:", error);
      setTokensError(
        "Unable to load tokens. Please check your network connection."
      );
      setAvailableTokens([]);
      setSourceToken(null);
      setTargetToken(null);
    } finally {
      setLoadingTokens(false);
    }
  };

  const checkController = async (
    address: string,
    source?: TokenInfo | null,
    target?: TokenInfo | null
  ) => {
    setCheckingController(true);
    try {
      // Use unified controller script (handles both USDC and USDF)
      console.log(`Checking unified controller...`);

      const isConfigured: boolean = await fcl.query({
        cadence: CHECK_CONTROLLER_SCRIPT_UNIFIED,
        args: (arg, t) => [arg(address, t.Address)],
      });
      setControllerConfigured(isConfigured);
      console.log(`Unified controller configured: ${isConfigured}`);
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

      // Fetch USDF balance
      const usdfBal = await fcl.query({
        cadence: GET_TOKEN_BALANCE_SCRIPT,
        args: (arg, t) => [arg(address, t.Address), arg("USDF", t.String)],
      });
      setUsdfBalance(parseFloat(usdfBal).toFixed(2));
    } catch (error) {
      console.error("Error fetching balances:", error);
      setFlowBalance("0.00");
      setUsdcBalance("0.00");
      setUsdfBalance("0.00");
    } finally {
      setLoadingBalance(false);
    }
  };

  // Helper to get balance for a specific token symbol
  const getTokenBalance = (symbol: string | undefined): string => {
    if (symbol === 'FLOW') return flowBalance;
    if (symbol === 'USDF') return usdfBalance;
    if (symbol === 'USDC') return usdcBalance;
    return "0.00";
  };

  // Get balance for currently selected source token
  const getSourceTokenBalance = (): string => {
    return getTokenBalance(sourceToken?.symbol);
  };

  const handleMaxClick = () => {
    const bal = parseFloat(getSourceTokenBalance()) || 0;
    // Reserve small amount for gas if source is FLOW
    const maxAmount = sourceToken?.symbol === 'FLOW'
      ? Math.max(0, bal - 0.01).toFixed(2)
      : bal.toFixed(2);
    setAmountPerInterval(maxAmount);
  };

  // Swap source and target tokens
  const handleSwapTokens = () => {
    const tempSource = sourceToken;
    setSourceToken(targetToken);
    setTargetToken(tempSource);
  };

  const handleSetupController = async (e: React.FormEvent) => {
    e.preventDefault();

    // Unified setup - single transaction handles everything
    // Pass setupCOA=true if USDF is involved (requires EVM)
    const isUsdfInvolved = sourceToken?.symbol === 'USDF' || targetToken?.symbol === 'USDF';
    console.log(`Setting up unified controller (COA needed: ${isUsdfInvolved})...`);

    const result = await executeTransaction(
      SETUP_CONTROLLER_TX_UNIFIED,
      (arg, t) => [arg(isUsdfInvolved, t.Bool)],
      500
    );

    if (!result.success) {
      console.error("Unified setup failed:", result.error);
      return;
    }

    console.log("Unified setup complete!");

    if (userAddress) {
      setTimeout(() => checkController(userAddress, sourceToken, targetToken), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!controllerConfigured) {
      alert("Please setup DCA Controller first by clicking the setup button below.");
      return;
    }

    if (!targetToken) {
      alert("Please select a target token.");
      return;
    }

    // Prepare transaction arguments
    const slippageBps = Math.floor(parseFloat(slippage) * 100);
    const firstExecutionDelay = parseInt(interval);
    const formattedAmount = parseFloat(amountPerInterval).toFixed(2);

    // Determine target token vault paths based on token type
    const isUsdf = targetToken.symbol === 'USDF';
    const isUsdc = targetToken.symbol === 'USDC';

    let targetVaultPath: string;
    let targetReceiverPath: string;
    let targetTokenType: string;

    if (isUsdf) {
      // USDF - EVM bridged token
      targetVaultPath = "evmVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed";
      targetReceiverPath = "evmVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed_receiver";
      targetTokenType = "A.1e4aa0b87d10b141.EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed.Vault";
    } else if (isUsdc) {
      // USDC - EVM bridged token (different address)
      targetVaultPath = "evmVMBridgedTokenVault_f1815bd50389c46847f0bda824ec8da914045d14";
      targetReceiverPath = "evmVMBridgedTokenReceiver_f1815bd50389c46847f0bda824ec8da914045d14";
      targetTokenType = "A.1e4aa0b87d10b141.EVMVMBridgedToken_f1815bd50389c46847f0bda824ec8da914045d14.Vault";
    } else if (targetToken.symbol === 'FLOW') {
      // FLOW native token
      targetVaultPath = "flowTokenVault";
      targetReceiverPath = "flowTokenReceiver";
      targetTokenType = "A.1654653399040a61.FlowToken.Vault";
    } else {
      alert(`Unsupported target token: ${targetToken.symbol}`);
      return;
    }

    console.log(`Creating unified plan: ${sourceToken?.symbol} → ${targetToken.symbol}`);
    console.log(`Target type: ${targetTokenType}`);
    console.log(`Target vault path: ${targetVaultPath}`);

    // ALL-IN-ONE: Create + Fund + Schedule in a single unified transaction!
    const result = await executeTransaction(
      CREATE_FUND_AND_SCHEDULE_PLAN_TX_UNIFIED,
      (arg, t) => [
        arg(targetTokenType, t.String),                     // targetTokenType
        arg(targetVaultPath, t.String),                     // targetVaultPath
        arg(targetReceiverPath, t.String),                  // targetReceiverPath
        arg(formattedAmount, t.UFix64),                     // amountPerInterval
        arg(interval, t.UInt64),                            // intervalSeconds
        arg(slippageBps.toString(), t.UInt64),              // maxSlippageBps
        arg(maxExecutions || "1000", t.UInt64),             // maxExecutions (default 1000 if empty)
        arg(firstExecutionDelay.toString(), t.UInt64),      // delaySeconds
        arg("0", t.UInt8),                                  // priority (High - guaranteed execution)
        arg("50000", t.UInt64),                             // executionEffort
      ],
      1000
    );

    if (result.success) {
      const intervalLabel = intervalOptions.find(o => o.value === interval)?.label.toLowerCase();
      alert(
        `🎉 Plan created and scheduled successfully!\n\n` +
        `Autonomous execution will begin in ${intervalLabel}.\n` +
        `Check the Dashboard to monitor progress.`
      );

      // Reset form and refresh balances
      setAmountPerInterval("");
      setMaxExecutions("");
      if (userAddress) {
        fetchBalances(userAddress);
      }
      resetTransaction();
    } else {
      alert(`Failed to create plan: ${result.error}`);
    }
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

  // Price estimation from CoinGecko API
  // Calculate exchange rate between source and target tokens
  const sourceSymbol = sourceToken?.symbol || 'USDC';
  const targetSymbol = targetToken?.symbol || 'FLOW';
  const sourcePrice = tokenPrices[sourceSymbol] || (sourceSymbol === 'USDF' ? tokenPrices['USDC'] : 0);
  const targetPrice = tokenPrices[targetSymbol] || (targetSymbol === 'USDF' ? tokenPrices['USDC'] : 0);

  // Exchange rate: how many target tokens per 1 source token
  const estimatedPrice = sourcePrice && targetPrice ? sourcePrice / targetPrice : 0;

  // Calculate output
  const estimatedOutput = estimatedPrice > 0 ? totalInvestment * estimatedPrice : 0;

  // Check if same token is selected for both (invalid)
  const isSameToken = sourceToken?.symbol === targetToken?.symbol;

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
          {/* From Token (Source) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">You invest</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  Balance: {loadingBalance ? "..." : getSourceTokenBalance()} {sourceToken?.symbol || ""}
                </span>
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="text-xs font-medium text-[#00EF8B] hover:text-[#00D9FF] transition-colors cursor-pointer"
                >
                  MAX
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#0a0a0a] rounded-xl p-4">
              {/* Source token selector dropdown */}
              <div className="relative">
                <select
                  value={sourceToken?.symbol || ''}
                  onChange={(e) => {
                    const token = availableTokens.find(t => t.symbol === e.target.value);
                    if (token) {
                      // If selecting the same as target, swap them
                      if (token.symbol === targetToken?.symbol) {
                        setTargetToken(sourceToken);
                      }
                      setSourceToken(token);
                    }
                  }}
                  className="appearance-none bg-gray-100 dark:bg-gray-800 rounded-lg pl-12 pr-8 py-2 font-semibold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {availableTokens.map((token) => (
                    <option key={token.symbol} value={token.symbol}>
                      {token.symbol}
                    </option>
                  ))}
                </select>
                {/* Token logo overlay */}
                <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  {sourceToken && getTokenLogoUrl(sourceToken.symbol) ? (
                    <img
                      src={getTokenLogoUrl(sourceToken.symbol)}
                      alt={sourceToken.symbol}
                      className="w-7 h-7 rounded-full"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00EF8B] to-[#00D9FF] flex items-center justify-center text-white font-bold text-xs">
                      {sourceToken?.symbol.charAt(0) || 'T'}
                    </div>
                  )}
                </div>
                {/* Dropdown arrow */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
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
            </div>
          </div>

          {/* Arrow Separator - Swap Button */}
          <div className="flex justify-center -my-1">
            <button
              type="button"
              onClick={handleSwapTokens}
              className="bg-gray-100 dark:bg-[#2a2a2a] hover:bg-[#00EF8B] dark:hover:bg-[#00EF8B] rounded-lg p-2 transition-all cursor-pointer group"
              title="Swap tokens"
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

          {/* To Token (Target) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">You accumulate</span>
              <span className="text-xs text-gray-500">Est. total output</span>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#0a0a0a] rounded-xl p-4">
              {/* Target token selector dropdown */}
              <div className="relative">
                <select
                  value={targetToken?.symbol || ''}
                  onChange={(e) => {
                    const token = availableTokens.find(t => t.symbol === e.target.value);
                    if (token) {
                      // If selecting the same as source, swap them
                      if (token.symbol === sourceToken?.symbol) {
                        setSourceToken(targetToken);
                      }
                      setTargetToken(token);
                    }
                  }}
                  className="appearance-none bg-gray-100 dark:bg-gray-800 rounded-lg pl-12 pr-8 py-2 font-semibold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {availableTokens.map((token) => (
                    <option key={token.symbol} value={token.symbol}>
                      {token.symbol}
                    </option>
                  ))}
                </select>
                {/* Token logo overlay */}
                <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  {targetToken && getTokenLogoUrl(targetToken.symbol) ? (
                    <img
                      src={getTokenLogoUrl(targetToken.symbol)}
                      alt={targetToken.symbol}
                      className="w-7 h-7 rounded-full"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00EF8B] to-[#00D9FF] flex items-center justify-center text-white font-bold text-xs">
                      {targetToken?.symbol.charAt(0) || 'T'}
                    </div>
                  )}
                </div>
                {/* Dropdown arrow */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <div className="flex-1 text-right text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {estimatedOutput > 0 ? estimatedOutput.toFixed(4) : "0.00"}
              </div>
            </div>
          </div>

          {/* Same token warning */}
          {isSameToken && (
            <div className="text-center text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
              Cannot invest and accumulate the same token
            </div>
          )}
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
                <span className="font-semibold">{amountPerInterval} {sourceToken?.symbol || ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Total investments</span>
                <span className="font-semibold">{maxExecutions}×</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-blue-200 dark:border-blue-800">
                <span className="text-gray-900 dark:text-gray-100 font-medium">Total amount</span>
                <span className="font-bold text-[#00EF8B]">{totalInvestment.toFixed(2)} {sourceToken?.symbol || ''}</span>
              </div>
            </div>
          </div>
        )}

        {/* Price Info */}
        {sourceToken && targetToken && (
          <div className="bg-gray-50 dark:bg-[#0a0a0a] rounded-xl p-4">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Market price {loadingPrices && "(updating...)"}</span>
                <span className="font-mono">
                  {estimatedPrice > 0 ? (
                    <>1 {sourceToken.symbol} ≈ {estimatedPrice.toFixed(4)} {targetToken.symbol}</>
                  ) : (
                    <span className="text-gray-400">Loading...</span>
                  )}
                </span>
              </div>
              {tokenPrices.FLOW && (
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>FLOW price</span>
                  <span className="font-mono">${tokenPrices.FLOW.toFixed(4)} USD</span>
                </div>
              )}
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
                  ✓ Real-time prices from CoinGecko • Swaps via IncrementFi
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
          <div className="mt-3 space-y-4">
            <div className="space-y-2">
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

            {/* Reconfigure Controller - for fixing vault capabilities */}
            {controllerConfigured && userAddress && (
              <div className="pt-3 border-t border-gray-200 dark:border-[#2a2a2a]">
                <p className="text-xs text-gray-500 mb-2">
                  If swaps are going in the wrong direction, reconfigure your controller:
                </p>
                <button
                  type="button"
                  onClick={handleSetupController}
                  disabled={txLoading}
                  className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {txLoading ? "Reconfiguring..." : "Reconfigure Controller (Fix Swap Direction)"}
                </button>
              </div>
            )}
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
          <div className="space-y-3">
            {/* Setup Required Warning */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    One-time setup required
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    This creates your DCA controller on-chain. You only need to do this once.
                  </p>
                </div>
              </div>
            </div>

            {/* Setup Button */}
            <button
              type="button"
              onClick={handleSetupController}
              disabled={txLoading || checkingController}
              className="w-full py-4 bg-gradient-to-r from-[#00EF8B] to-[#00D9FF] text-black font-bold rounded-xl hover:shadow-lg hover:shadow-[#00EF8B]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {checkingController
                ? "Checking status..."
                : txLoading
                ? "Setting up... (approve in wallet)"
                : "Setup DCA Controller"}
            </button>

            {/* Refresh Status Link */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => userAddress && checkController(userAddress, sourceToken, targetToken)}
                disabled={checkingController}
                className="text-xs text-gray-500 hover:text-[#00EF8B] transition-colors cursor-pointer disabled:opacity-50"
              >
                {checkingController ? "Checking..." : "Already setup? Click to refresh status"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            disabled={txLoading || !amountPerInterval || !sourceToken || !targetToken || isSameToken}
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
