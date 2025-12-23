"use client";

import { useState, useEffect } from "react";
import * as fcl from "@onflow/fcl";
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt, useBalance } from "wagmi";
import { parseUnits } from "viem";
import { useTransaction } from "@/hooks/use-transaction";
import { useWalletType } from "@/components/wallet-selector";
import {
  SETUP_COA_TX,
  WRAP_AND_APPROVE_TX,
  APPROVE_DCA_TX,
  GET_USER_COA_SCRIPT,
  GET_TOKEN_BALANCE_SCRIPT,
  CHECK_ALLOWANCE_SCRIPT,
} from "@/lib/cadence-transactions";
import { ERC20_ABI, createAndScheduleDCAPlan } from "@/lib/transaction-relay";
import { TransactionStatus, EVM_TOKENS, DCA_COA_ADDRESS } from "@/config/fcl-config";
import { getTokenPrices } from "@/lib/price-service";

// Supported tokens for DCA
// Metamask users: EVM tokens (WFLOW, USDF)
// Flow Wallet users: Native FLOW (backend handles wrapping)
const EVM_TOKEN_LIST = [
  { symbol: "WFLOW", address: EVM_TOKENS.WFLOW, decimals: 18 },
  { symbol: "USDF", address: EVM_TOKENS.USDF, decimals: 6 },
];

// For Flow Wallet users - show native FLOW
// Backend will handle FLOW → WFLOW conversion during DCA execution
const CADENCE_TOKEN_LIST = [
  { symbol: "FLOW", address: EVM_TOKENS.WFLOW, decimals: 18, isNative: true },
  { symbol: "USDF", address: EVM_TOKENS.USDF, decimals: 6, isNative: false },
];

interface CreateDCAPlanProps {
  onPlanCreated?: () => void;
}

export function CreateDCAPlan({ onPlanCreated }: CreateDCAPlanProps) {
  // Wallet type detection
  const { isMetamask, isFlow } = useWalletType();

  // Flow wallet state
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userCOAAddress, setUserCOAAddress] = useState<string | null>(null);

  // Metamask wallet state (wagmi)
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount();

  // Form state
  const [amountPerInterval, setAmountPerInterval] = useState("");
  const [interval, setInterval] = useState("86400"); // Default to Daily
  const [slippage, setSlippage] = useState("1");
  const [maxExecutions, setMaxExecutions] = useState("");

  // Token selection - use appropriate list based on wallet type
  const tokenList = isFlow ? CADENCE_TOKEN_LIST : EVM_TOKEN_LIST;
  const [sourceTokenState, setSourceToken] = useState(tokenList[0]);
  const [targetTokenState, setTargetToken] = useState(tokenList[1]);

  // Update tokens when wallet type changes
  useEffect(() => {
    const newList = isFlow ? CADENCE_TOKEN_LIST : EVM_TOKEN_LIST;
    setSourceToken(newList[0]);
    setTargetToken(newList[1]);
  }, [isFlow]);

  // Ensure tokens are always valid for current wallet type (handles race conditions)
  const sourceToken = tokenList.find(t => t.address === sourceTokenState.address) || tokenList[0];
  const targetToken = tokenList.find(t => t.address === targetTokenState.address) || tokenList[1];

  // Setup state (Flow wallet)
  const [hasCOA, setHasCOA] = useState(false);
  const [checkingCOA, setCheckingCOA] = useState(false);
  const [hasApproval, setHasApproval] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(false);
  // Track if user has funded their COA for the current plan configuration
  // This resets when amount/executions change to ensure fresh funding for each plan
  const [hasFundedForCurrentPlan, setHasFundedForCurrentPlan] = useState(false);

  // Balance state
  const [flowBalance, setFlowBalance] = useState("0.00");
  const [coaTokenBalance, setCoaTokenBalance] = useState("0.00"); // EVM token balance in user's COA
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Price state
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Plan creation state
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [planCreationError, setPlanCreationError] = useState<string | null>(null);
  const [planCreationSuccess, setPlanCreationSuccess] = useState(false);

  // Metamask ERC-20 approval (wagmi)
  const { writeContract: approveERC20, data: approveHash, isPending: isApproving, error: approveError } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess, error: receiptError } = useWaitForTransactionReceipt({
    hash: approveHash,
    // Flow EVM needs explicit polling since websocket subscriptions may not work
    pollingInterval: 2000,
    // Timeout after 60 seconds
    timeout: 60_000,
  });

  // Log approval errors for debugging
  useEffect(() => {
    if (approveError) {
      console.error("Approve write error:", approveError);
    }
    if (receiptError) {
      console.error("Receipt wait error:", receiptError);
    }
    if (approveHash) {
      console.log("Approval tx hash:", approveHash);
    }
  }, [approveError, receiptError, approveHash]);

  // Check Metamask allowance
  const { data: metamaskAllowance, refetch: refetchAllowance } = useReadContract({
    address: sourceToken.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: evmAddress && DCA_COA_ADDRESS ? [evmAddress, DCA_COA_ADDRESS as `0x${string}`] : undefined,
    query: {
      enabled: isMetamask && isEvmConnected && !!evmAddress,
    },
  });

  // Fetch Metamask token balance (WFLOW or USDF depending on sourceToken)
  const { data: metamaskTokenBalance, isLoading: isLoadingMetamaskBalance } = useReadContract({
    address: sourceToken.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: evmAddress ? [evmAddress] : undefined,
    query: {
      enabled: isMetamask && isEvmConnected && !!evmAddress,
    },
  });

  // Format Metamask balance for display
  const formattedMetamaskBalance = metamaskTokenBalance !== undefined && metamaskTokenBalance !== null
    ? (Number(metamaskTokenBalance) / 10 ** sourceToken.decimals).toFixed(2)
    : "0.00";

  // Refetch allowance after approval success
  useEffect(() => {
    if (isApproveSuccess) {
      setTimeout(() => refetchAllowance(), 2000);
    }
  }, [isApproveSuccess, refetchAllowance]);

  // Calculate required approval amount for current plan
  const getRequiredApprovalAmount = (): bigint => {
    if (!amountPerInterval || !maxExecutions) return BigInt(0);
    const executions = parseInt(maxExecutions) || 1;
    const amountPerExec = parseFloat(amountPerInterval) || 0;
    const totalNeeded = amountPerExec * executions * 1.05; // 5% buffer
    try {
      return parseUnits(totalNeeded.toFixed(sourceToken.decimals), sourceToken.decimals);
    } catch {
      return BigInt(0);
    }
  };

  const requiredApprovalAmount = getRequiredApprovalAmount();

  // Check if current allowance is sufficient for the NEW plan amount
  const hasMetamaskApproval = metamaskAllowance
    ? BigInt(metamaskAllowance) >= requiredApprovalAmount && requiredApprovalAmount > BigInt(0)
    : false;

  const {
    status: txStatus,
    txId,
    error: txError,
    executeTransaction,
    resetTransaction,
    isLoading: txLoading,
  } = useTransaction();

  // Subscribe to user authentication
  useEffect(() => {
    const unsubscribe = fcl.currentUser.subscribe((currentUser) => {
      if (currentUser && currentUser.addr) {
        setUserAddress(currentUser.addr);
        checkCOA(currentUser.addr);
        fetchBalance(currentUser.addr);
      } else {
        setUserAddress(null);
        setUserCOAAddress(null);
        setHasCOA(false);
        setHasApproval(false);
        setFlowBalance("0.00");
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch prices
  useEffect(() => {
    const fetchPrices = async () => {
      setLoadingPrices(true);
      try {
        const prices = await getTokenPrices(["FLOW", "USDC"]);
        // Use USDC price as proxy for USDF
        setTokenPrices({ ...prices, USDF: prices.USDC || 1.0 });
      } catch (error) {
        console.error("Failed to fetch prices:", error);
      } finally {
        setLoadingPrices(false);
      }
    };
    fetchPrices();
    const priceInterval = window.setInterval(fetchPrices, 5 * 60 * 1000);
    return () => window.clearInterval(priceInterval);
  }, []);

  // Check COA when source token changes
  useEffect(() => {
    if (userCOAAddress) {
      checkApproval(userCOAAddress, sourceToken.address);
    }
  }, [userCOAAddress, sourceToken.address]);

  // Reset funding state when plan parameters change (for Flow wallet FLOW token)
  // This ensures user must fund for each new plan configuration
  useEffect(() => {
    setHasFundedForCurrentPlan(false);
  }, [amountPerInterval, maxExecutions, sourceToken.address]);

  const checkCOA = async (address: string) => {
    setCheckingCOA(true);
    try {
      const coaAddress: string | null = await fcl.query({
        cadence: GET_USER_COA_SCRIPT,
        args: (arg, t) => [arg(address, t.Address)],
      });
      if (coaAddress) {
        setUserCOAAddress(coaAddress);
        setHasCOA(true);
        checkApproval(coaAddress, sourceToken.address);
      } else {
        setUserCOAAddress(null);
        setHasCOA(false);
        setHasApproval(false);
      }
    } catch (error) {
      console.error("Error checking COA:", error);
      setHasCOA(false);
    } finally {
      setCheckingCOA(false);
    }
  };

  const checkApproval = async (coaAddress: string, tokenAddress: string) => {
    setCheckingApproval(true);
    try {
      // Remove 0x prefix for the script
      const cleanCoaAddress = coaAddress.startsWith("0x") ? coaAddress : `0x${coaAddress}`;
      const cleanTokenAddress = tokenAddress.startsWith("0x") ? tokenAddress : `0x${tokenAddress}`;

      const allowance = await fcl.query({
        cadence: CHECK_ALLOWANCE_SCRIPT,
        args: (arg, t) => [
          arg(cleanCoaAddress, t.String),
          arg(cleanTokenAddress, t.String),
        ],
      });
      // Consider approved if allowance > 0
      setHasApproval(BigInt(allowance) > BigInt(0));
    } catch (error) {
      console.error("Error checking approval:", error);
      setHasApproval(false);
    } finally {
      setCheckingApproval(false);
    }
  };

  const fetchBalance = async (address: string) => {
    setLoadingBalance(true);
    try {
      const balance = await fcl.query({
        cadence: GET_TOKEN_BALANCE_SCRIPT,
        args: (arg, t) => [arg(address, t.Address), arg("FLOW", t.String)],
      });
      setFlowBalance(parseFloat(balance).toFixed(2));
    } catch (error) {
      console.error("Error fetching balance:", error);
      setFlowBalance("0.00");
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleSetupCOA = async (e: React.FormEvent) => {
    e.preventDefault();
    // Setup COA with 0.1 FLOW initial funding for gas
    const result = await executeTransaction(
      SETUP_COA_TX,
      (arg, t) => [arg("0.1", t.Optional(t.UFix64))],
      500
    );
    if (result.success && userAddress) {
      setTimeout(() => checkCOA(userAddress), 2000);
    }
  };

  // Combined: Deposit FLOW + Wrap to WFLOW + Approve DCA service in ONE transaction
  const handleFundAndApprove = async () => {
    if (!amountPerInterval || !maxExecutions) return;

    // Calculate total deposit: amountPerInterval × maxExecutions
    const executions = parseInt(maxExecutions);
    const totalDeposit = (parseFloat(amountPerInterval) * executions).toString();
    // UFix64 requires decimal point
    const formattedAmount = totalDeposit.includes('.') ? totalDeposit : `${totalDeposit}.0`;

    // DCA COA address (spender) - network-aware from config
    const spenderAddressClean = DCA_COA_ADDRESS.replace("0x", "");

    // Approve max uint256 for unlimited future approvals
    const maxUint256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

    const result = await executeTransaction(
      WRAP_AND_APPROVE_TX,
      (arg, t) => [
        arg(formattedAmount, t.UFix64),
        arg(spenderAddressClean, t.String),
        arg(maxUint256, t.UInt256),
      ],
      500
    );

    if (result.success) {
      // Mark as funded for this plan configuration
      setHasFundedForCurrentPlan(true);
      // Refresh approval status and balance
      if (userCOAAddress) {
        setTimeout(() => checkApproval(userCOAAddress, sourceToken.address), 2000);
      }
      if (userAddress) {
        setTimeout(() => fetchBalance(userAddress), 2000);
      }
    }
  };

  // Approve DCA service for non-FLOW tokens (e.g., USDF already in COA)
  const handleApprove = async () => {
    // Approve max uint256 for convenience
    const maxUint256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    // Remove 0x prefix for Cadence
    const tokenAddressClean = sourceToken.address.replace("0x", "");
    // DCA COA address (spender) - network-aware from config
    const spenderAddressClean = DCA_COA_ADDRESS.replace("0x", "");

    const result = await executeTransaction(
      APPROVE_DCA_TX,
      (arg, t) => [
        arg(tokenAddressClean, t.String),
        arg(spenderAddressClean, t.String),
        arg(maxUint256, t.UInt256),
      ],
      500
    );
    if (result.success && userCOAAddress) {
      setTimeout(() => checkApproval(userCOAAddress, sourceToken.address), 2000);
    }
  };

  const handleSwapTokens = () => {
    const temp = sourceToken;
    setSourceToken(targetToken);
    setTargetToken(temp);
  };

  // Metamask: Approve ERC-20 token spending
  // Only approve the exact amount needed for this DCA plan (safer than unlimited)
  const handleMetamaskApprove = () => {
    // Calculate exact amount needed: amountPerInterval × maxExecutions
    const executions = maxExecutions ? parseInt(maxExecutions) : 1;
    const totalAmountNeeded = parseFloat(amountPerInterval) * executions;
    // Add 5% buffer for potential rounding/gas
    const amountWithBuffer = totalAmountNeeded * 1.05;
    const approvalAmount = parseUnits(amountWithBuffer.toFixed(sourceToken.decimals), sourceToken.decimals);

    approveERC20({
      address: sourceToken.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DCA_COA_ADDRESS as `0x${string}`, approvalAmount],
    });
  };

  // Create DCA plan (works for both wallet types)
  // Uses backend API for sponsored transactions - no Flow wallet needed for Metamask users
  const handleCreatePlan = async () => {
    setIsCreatingPlan(true);
    setPlanCreationError(null);
    setPlanCreationSuccess(false);

    try {
      // Determine user's EVM address
      const userEVMAddr = isMetamask ? evmAddress : userCOAAddress;

      if (!userEVMAddr) {
        throw new Error("No EVM address available");
      }

      // Convert amount to wei based on token decimals
      const amountInWei = parseUnits(amountPerInterval, sourceToken.decimals).toString();

      // Create AND schedule the plan via backend API (sponsored transaction)
      // Backend service account pays for Cadence gas
      const result = await createAndScheduleDCAPlan({
        userEVMAddress: userEVMAddr,
        sourceToken: sourceToken.address,
        targetToken: targetToken.address,
        amountPerInterval: amountInWei,
        intervalSeconds: parseInt(interval),
        maxSlippageBps: parseInt(slippage) * 100, // Convert % to bps
        maxExecutions: maxExecutions ? parseInt(maxExecutions) : null,
        feeTier: 3000, // 0.3% Uniswap fee tier
        firstExecutionDelay: parseFloat(interval), // First execution after one interval
      });

      if (result.success) {
        setPlanCreationSuccess(true);
        // Auto-redirect to dashboard after 1.5 seconds
        if (onPlanCreated) {
          setTimeout(() => {
            onPlanCreated();
          }, 1500);
        }
      } else {
        setPlanCreationError(result.error || "Failed to create plan");
      }
    } catch (error: any) {
      setPlanCreationError(error.message || "Failed to create plan");
    } finally {
      setIsCreatingPlan(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isMetamask) {
      // Metamask flow: just need approval, then create plan
      if (!hasMetamaskApproval) {
        alert("Please approve the DCA service to spend your tokens first.");
        return;
      }
      await handleCreatePlan();
    } else {
      // Flow wallet flow: need COA + approval
      if (!hasCOA) {
        alert("Please setup your COA first.");
        return;
      }

      if (!hasApproval) {
        alert("Please approve the DCA service to spend your tokens first.");
        return;
      }

      await handleCreatePlan();
    }
  };

  const intervalOptions = [
    { value: "60", label: "Minutely" },
    { value: "3600", label: "Hourly" },
    { value: "86400", label: "Daily" },
    { value: "604800", label: "Weekly" },
  ];

  // Price estimation
  const amountNum = parseFloat(amountPerInterval) || 0;
  const numExecutions = maxExecutions ? parseInt(maxExecutions) : 1;
  const totalInvestment = amountNum * numExecutions;

  // FLOW/WFLOW/USDF price estimation (FLOW = WFLOW = same price)
  const flowPrice = tokenPrices.FLOW || 0;
  const usdfPrice = tokenPrices.USDF || 1.0;
  const isFlowOrWflow = (symbol: string) => symbol === "FLOW" || symbol === "WFLOW";
  const sourcePrice = isFlowOrWflow(sourceToken.symbol) ? flowPrice : usdfPrice;
  const targetPrice = isFlowOrWflow(targetToken.symbol) ? flowPrice : usdfPrice;
  // Only calculate exchange rate if we have valid prices
  const exchangeRate = (sourcePrice > 0 && targetPrice > 0) ? sourcePrice / targetPrice : 0;
  const estimatedOutput = (exchangeRate > 0 && amountNum > 0) ? totalInvestment * exchangeRate : 0;

  // FLOW and WFLOW are equivalent for DCA purposes
  const isFlowToken = (symbol: string) => symbol === "FLOW" || symbol === "WFLOW";
  const isSameToken = sourceToken.symbol === targetToken.symbol ||
    (isFlowToken(sourceToken.symbol) && isFlowToken(targetToken.symbol));

  return (
    <div className="w-full max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-[#00EF8B] to-[#7FFFC4] bg-clip-text text-transparent">
            Create DCA Strategy
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Automate your {isFlow ? "FLOW" : "WFLOW"} ↔ USDF investments
          </p>
        </div>

        {/* Swap Interface */}
        <div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-2xl p-6 space-y-3">
          {/* From Token */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">You invest</span>
              <span className="text-xs text-gray-500">
                {isFlow ? (
                  sourceToken.symbol === "FLOW" ? (
                    <>FLOW Balance: {loadingBalance ? "..." : flowBalance}</>
                  ) : (
                    <>COA: {userCOAAddress ? `${userCOAAddress.slice(0, 8)}...` : "Not set up"}</>
                  )
                ) : isEvmConnected ? (
                  <>{sourceToken.symbol} Balance: {isLoadingMetamaskBalance ? "..." : formattedMetamaskBalance}</>
                ) : null}
              </span>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#0a0a0a] rounded-xl p-4">
              <select
                value={sourceToken.symbol}
                onChange={(e) => {
                  const token = tokenList.find((t) => t.symbol === e.target.value);
                  if (token) {
                    if (token.symbol === targetToken.symbol) {
                      setTargetToken(sourceToken);
                    }
                    setSourceToken(token);
                  }
                }}
                className="appearance-none bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2 font-semibold cursor-pointer"
              >
                {tokenList.map((token) => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amountPerInterval}
                onChange={(e) => setAmountPerInterval(e.target.value)}
                placeholder="0.00"
                required
                className="flex-1 bg-transparent text-right text-2xl font-semibold outline-none"
              />
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center -my-1">
            <button
              type="button"
              onClick={handleSwapTokens}
              className="bg-gray-100 dark:bg-[#2a2a2a] hover:bg-[#00EF8B] rounded-lg p-2 transition-all cursor-pointer group"
            >
              <svg className="w-5 h-5 text-gray-600 group-hover:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To Token */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">You accumulate</span>
              <span className="text-xs text-gray-500">Est. output</span>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#0a0a0a] rounded-xl p-4">
              <select
                value={targetToken.symbol}
                onChange={(e) => {
                  const token = tokenList.find((t) => t.symbol === e.target.value);
                  if (token) {
                    if (token.symbol === sourceToken.symbol) {
                      setSourceToken(targetToken);
                    }
                    setTargetToken(token);
                  }
                }}
                className="appearance-none bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2 font-semibold cursor-pointer"
              >
                {tokenList.map((token) => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
              </select>
              <div className="flex-1 text-right text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {estimatedOutput > 0 ? estimatedOutput.toFixed(4) : "0.00"}
              </div>
            </div>
          </div>

          {isSameToken && (
            <div className="text-center text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
              Cannot invest and accumulate the same token
            </div>
          )}
        </div>

        {/* Frequency */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Investment Frequency
          </label>
          <div className="grid grid-cols-4 gap-2">
            {intervalOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setInterval(option.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  interval === option.value
                    ? "bg-[#00EF8B] text-black"
                    : "bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] hover:border-[#00EF8B]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Max Executions */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Number of Investments
          </label>
          <input
            type="number"
            min="1"
            value={maxExecutions}
            onChange={(e) => setMaxExecutions(e.target.value)}
            placeholder="e.g., 10"
            required
            className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl focus:border-[#00EF8B] outline-none"
          />
          <p className="text-xs text-gray-500">
            Total: {totalInvestment.toFixed(2)} {sourceToken.symbol} will be allocated for DCA
          </p>
        </div>

        {/* Price Info */}
        <div className="bg-gray-50 dark:bg-[#0a0a0a] rounded-xl p-4 text-xs space-y-2">
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>Exchange rate {loadingPrices && "(updating...)"}</span>
            <span className="font-mono">
              {exchangeRate > 0
                ? `1 ${sourceToken.symbol} ≈ ${exchangeRate.toFixed(4)} ${targetToken.symbol}`
                : "Loading..."}
            </span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>Slippage tolerance</span>
            <span>{slippage}%</span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>DCA Service COA</span>
            <span className="font-mono text-[10px]">{DCA_COA_ADDRESS.slice(0, 20)}...</span>
          </div>
        </div>

        {/* Setup Steps - Different flows for Metamask vs Flow Wallet */}
        {isMetamask ? (
          // METAMASK FLOW - Simpler: just connect + approve + create
          !isEvmConnected ? (
            <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
              <p className="text-orange-800 dark:text-orange-200 mb-2">
                Connect your Metamask wallet using the button in the header
              </p>
            </div>
          ) : !hasMetamaskApproval ? (
            <div className="space-y-3">
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                  Approve DCA Service
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  Approve <span className="font-semibold">{(totalInvestment * 1.05).toFixed(2)} {sourceToken.symbol}</span> for this DCA plan
                </p>
                {metamaskAllowance && BigInt(metamaskAllowance) > BigInt(0) && (
                  <p className="text-xs text-orange-500 dark:text-orange-500 mt-2">
                    Current allowance: {(Number(metamaskAllowance) / 10 ** sourceToken.decimals).toFixed(4)} {sourceToken.symbol} (insufficient for this plan)
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleMetamaskApprove}
                disabled={isApproving || isApproveConfirming || !amountPerInterval || !maxExecutions}
                className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold rounded-xl disabled:opacity-50 cursor-pointer"
              >
                {(isApproving || isApproveConfirming) ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {isApproving ? "Confirm in Metamask..." : "Confirming..."}
                  </span>
                ) : `Approve ${(totalInvestment * 1.05).toFixed(2)} ${sourceToken.symbol}`}
              </button>

              {isApproveSuccess && (
                <div className="text-center text-sm text-green-600">
                  Approval successful! Refreshing...
                </div>
              )}

              {(approveError || receiptError) && (
                <div className="text-center text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
                  Error: {approveError?.message || receiptError?.message || "Transaction failed"}
                </div>
              )}

              {approveHash && !isApproveSuccess && !isApproveConfirming && (
                <div className="text-center text-xs text-gray-500">
                  TX: <a href={`https://evm.flowscan.io/tx/${approveHash}`} target="_blank" rel="noopener noreferrer" className="underline">{approveHash.slice(0, 20)}...</a>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Ready to Create DCA Strategy
                  </p>
                </div>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Your Metamask is connected and approved for {sourceToken.symbol} swaps.
                </p>
              </div>

              <button
                type="submit"
                disabled={isCreatingPlan || !amountPerInterval || !maxExecutions || isSameToken}
                className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold rounded-xl hover:shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {isCreatingPlan ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Creating Plan...
                  </span>
                ) : "Create DCA Strategy"}
              </button>

              {planCreationSuccess && (
                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-600 font-medium">DCA Plan Created!</span>
                  </div>
                  <p className="text-sm text-green-600">Redirecting to dashboard...</p>
                </div>
              )}

              {planCreationError && (
                <div className="text-center text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
                  Error: {planCreationError}
                </div>
              )}
            </div>
          )
        ) : (
          // FLOW WALLET FLOW - Full setup: COA + wrap + approve + create
          !userAddress ? (
            <button
              type="button"
              onClick={() => fcl.authenticate()}
              className="w-full py-4 bg-gradient-to-r from-[#00EF8B] to-[#00D9FF] text-black font-bold rounded-xl hover:shadow-lg transition-all cursor-pointer"
            >
              Connect Flow Wallet
            </button>
          ) : !hasCOA ? (
            <div className="space-y-3">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Setup EVM Account
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Create your EVM-compatible account for DCA swaps
                </p>
              </div>
              <button
                type="button"
                onClick={handleSetupCOA}
                disabled={txLoading || checkingCOA}
                className="w-full py-4 bg-gradient-to-r from-[#00EF8B] to-[#00D9FF] text-black font-bold rounded-xl disabled:opacity-50 cursor-pointer"
              >
                {(checkingCOA || txLoading) ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {checkingCOA ? "Checking..." : "Setting up..."}
                  </span>
                ) : "Setup COA"}
              </button>
            </div>
          ) : ((sourceToken.symbol === "FLOW" && !hasFundedForCurrentPlan) || !hasApproval) ? (
            // Step 2: Fund & Approve (combined for FLOW) or just Approve (for USDF)
            // For FLOW: always need to fund for each new plan, even if approval exists
            sourceToken.symbol === "FLOW" ? (
              // FLOW: Combined deposit + wrap + approve in one transaction
              <div className="space-y-3">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Fund & Approve DCA Strategy
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Deposit <span className="font-semibold">{totalInvestment.toFixed(2)} FLOW</span> and approve DCA service in one step
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleFundAndApprove}
                  disabled={txLoading || !amountPerInterval || !maxExecutions}
                  className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {txLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </span>
                  ) : `Fund & Approve ${totalInvestment.toFixed(2)} FLOW`}
                </button>
              </div>
            ) : (
              // USDF: Just approve (user must have USDF in their COA already)
              <div className="space-y-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Approve DCA Service
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Allow automated {sourceToken.symbol} swaps from your COA
                  </p>
                  <p className="text-xs text-blue-500 dark:text-blue-500 mt-2">
                    Note: Ensure you have {sourceToken.symbol} in your COA ({userCOAAddress?.slice(0, 10)}...)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={txLoading || checkingApproval}
                  className="w-full py-4 bg-gradient-to-r from-[#00EF8B] to-[#00D9FF] text-black font-bold rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {(checkingApproval || txLoading) ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {checkingApproval ? "Checking..." : "Approving..."}
                    </span>
                  ) : `Approve ${sourceToken.symbol}`}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Ready to Create DCA Strategy
                  </p>
                </div>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Your account is set up and approved for {sourceToken.symbol} swaps.
                </p>
              </div>

              <button
                type="submit"
                disabled={isCreatingPlan || txLoading || !amountPerInterval || !maxExecutions || isSameToken}
                className="w-full py-4 bg-gradient-to-r from-[#00EF8B] to-[#00D9FF] text-black font-bold rounded-xl hover:shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {(isCreatingPlan || txLoading) ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {isCreatingPlan ? "Creating Plan..." : "Processing..."}
                  </span>
                ) : "Create DCA Strategy"}
              </button>

              {planCreationSuccess && (
                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-600 font-medium">DCA Plan Created!</span>
                  </div>
                  <p className="text-sm text-green-600">Redirecting to dashboard...</p>
                </div>
              )}

              {planCreationError && (
                <div className="text-center text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
                  Error: {planCreationError}
                </div>
              )}
            </div>
          )
        )}

        {/* Transaction Status */}
        {txStatus !== TransactionStatus.IDLE && (
          <div className={`p-4 rounded-xl ${
            txStatus === TransactionStatus.ERROR
              ? "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
              : txStatus === TransactionStatus.SEALED
              ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200"
              : "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200"
          }`}>
            <p className="font-medium">
              {txStatus === TransactionStatus.PENDING && "Awaiting approval..."}
              {txStatus === TransactionStatus.EXECUTING && "Processing..."}
              {txStatus === TransactionStatus.SEALING && "Finalizing..."}
              {txStatus === TransactionStatus.SEALED && "Success!"}
              {txStatus === TransactionStatus.ERROR && `Error: ${txError}`}
            </p>
            {txId && (
              <p className="text-sm mt-1 font-mono">TX: {txId.slice(0, 16)}...</p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
