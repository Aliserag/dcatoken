"use client";

import { useState, useEffect } from "react";
import * as fcl from "@onflow/fcl";
import { useAccount } from "wagmi";
import { useWalletType } from "@/components/wallet-selector";
import {
  GET_USER_PLANS_SCRIPT,
  GET_USER_COA_SCRIPT,
} from "@/lib/cadence-transactions";
import { useFlowPrice } from "@/hooks/use-flow-price";
import { NETWORK } from "@/config/fcl-config";

// EVM Token Addresses - defined here for reliable client-side lookup
const EVM_TOKENS_BY_NETWORK = {
  mainnet: {
    WFLOW: "0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e",
    USDF: "0x2aaBea2058b5aC2D339b163C6Ab6f2b6d53aabED",
    USDC: "0xF1815bd50389c46847f0Bda824eC8da914045D14",
  },
  testnet: {
    WFLOW: "0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e",
    USDF: "0xd7d43ab7b365f0d0789aE83F4385fA710FfdC98F",
    USDC: "0xd431955D55a99EF69BEb96BA34718d0f9fBc91b1",
  },
  emulator: {
    WFLOW: "0x0000000000000000000000000000000000000000",
    USDF: "0x0000000000000000000000000000000000000000",
    USDC: "0x0000000000000000000000000000000000000000",
  },
};

interface EVMPlanData {
  id: string;
  userEVMAddressBytes: number[];
  sourceTokenBytes: number[];
  targetTokenBytes: number[];
  amountPerInterval: string;
  intervalSeconds: string;
  maxSlippageBps: string;
  maxExecutions: string | null;
  feeTier: string;
  createdAt: string;
  statusRaw: string;
  nextExecutionTime: string | null;
  executionCount: string;
  totalSourceSpent: string;
  totalTargetReceived: string;
}

interface DCAPlan {
  id: number;
  amount: string;
  frequency: string;
  totalInvested: string;
  totalAcquired: string;
  avgPrice: string;
  sourceToken: string;
  targetToken: string;
  executionCount: number;
  maxExecutions: number | null;
  status: "active" | "paused" | "completed" | "cancelled";
  nextExecution: string;
  createdAt: string;
  intervalSeconds: number;
  isStuck: boolean; // Plan is active but execution time passed without executing
}

// Countdown Timer Component
function CountdownTimer({
  targetTimestamp,
  onCountdownComplete,
  planStatus,
}: {
  targetTimestamp: string;
  onCountdownComplete?: () => void;
  planStatus?: string;
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

      if (isNaN(timestampNum) || timestampNum <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const targetTime = timestampNum * 1000;
      const now = Date.now();
      const difference = targetTime - now;

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        const timeSinceTarget = -difference;
        const isRecentlyPassed = timeSinceTarget < 2 * 60 * 1000;

        if (!hasTriggered && onCountdownComplete && isRecentlyPassed) {
          setHasTriggered(true);
          setTimeout(() => onCountdownComplete(), 5000);
        }
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / (1000 * 60)) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [targetTimestamp, hasTriggered, onCountdownComplete]);

  useEffect(() => {
    setHasTriggered(false);
  }, [targetTimestamp]);

  if (!timeLeft)
    return <span className="text-sm text-gray-500">Loading...</span>;

  if (
    timeLeft.days === 0 &&
    timeLeft.hours === 0 &&
    timeLeft.minutes === 0 &&
    timeLeft.seconds === 0
  ) {
    if (planStatus === "completed") {
      return <span className="text-sm text-gray-500">Plan completed</span>;
    }
    if (planStatus === "paused") {
      return <span className="text-sm text-yellow-500">Paused</span>;
    }
    if (planStatus === "cancelled") {
      return <span className="text-sm text-red-500">Cancelled</span>;
    }

    const timestampNum = parseFloat(targetTimestamp);
    const targetTime = timestampNum * 1000;
    const timeSinceTarget = Date.now() - targetTime;
    const isStalled = timeSinceTarget > 2 * 60 * 1000;

    if (isStalled) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-orange-500">Awaiting execution...</span>
          <svg
            className="animate-pulse h-3 w-3 text-orange-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <circle cx="12" cy="12" r="10" />
          </svg>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#00EF8B]">Executing...</span>
        <svg
          className="animate-spin h-4 w-4 text-[#00EF8B]"
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
      <span className="font-bold">
        {String(timeLeft.hours).padStart(2, "0")}
      </span>
      <span className="text-gray-500">:</span>
      <span className="font-bold">
        {String(timeLeft.minutes).padStart(2, "0")}
      </span>
      <span className="text-gray-500">:</span>
      <span className="font-bold">
        {String(timeLeft.seconds).padStart(2, "0")}
      </span>
    </div>
  );
}

// Helper to convert EVM address bytes to hex string
function bytesToHex(bytes: number[] | string[]): string {
  return "0x" + bytes.map((b) => {
    // Handle both number and string byte values from FCL
    const num = typeof b === 'string' ? parseInt(b, 10) : b;
    return num.toString(16).padStart(2, "0");
  }).join("");
}

// Helper to get token symbol from EVM address
function getTokenSymbol(address: string): string {
  const addrLower = address.toLowerCase();

  // Check current network first
  const currentNetworkTokens =
    EVM_TOKENS_BY_NETWORK[NETWORK as keyof typeof EVM_TOKENS_BY_NETWORK] ||
    EVM_TOKENS_BY_NETWORK.mainnet;
  if (addrLower === currentNetworkTokens.WFLOW.toLowerCase()) return "WFLOW";
  if (addrLower === currentNetworkTokens.USDF.toLowerCase()) return "USDF";
  if (addrLower === currentNetworkTokens.USDC.toLowerCase()) return "USDC";

  // Also check all networks in case plan was created on different network
  for (const network of Object.values(EVM_TOKENS_BY_NETWORK)) {
    if (addrLower === network.WFLOW.toLowerCase()) return "WFLOW";
    if (addrLower === network.USDF.toLowerCase()) return "USDF";
    if (addrLower === network.USDC.toLowerCase()) return "USDC";
  }

  // Show truncated address for unknown tokens
  if (address.length >= 10) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  return address;
}

// Helper to format amounts with smart decimal display
function formatAmount(value: string, minDecimals: number = 4): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "0";

  // For very small numbers, show more decimals
  if (num < 0.0001) {
    return num.toFixed(8);
  } else if (num < 0.01) {
    return num.toFixed(6);
  } else if (num < 1) {
    return num.toFixed(minDecimals);
  } else if (num < 1000) {
    return num.toFixed(Math.min(minDecimals, 4));
  } else {
    // Large numbers - use fewer decimals
    return num.toFixed(2);
  }
}

export function DCADashboard() {
  const { isMetamask, isFlow } = useWalletType();
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount();

  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userCOAAddress, setUserCOAAddress] = useState<string | null>(null);
  const [plans, setPlans] = useState<DCAPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "completed" | "paused"
  >("all");
  const { priceData } = useFlowPrice();

  // Handle Flow wallet authentication
  useEffect(() => {
    if (isMetamask) return; // Skip for Metamask users

    const unsubscribe = fcl.currentUser.subscribe((currentUser) => {
      if (currentUser && currentUser.addr) {
        setUserAddress(currentUser.addr);
        fetchUserCOA(currentUser.addr);
      } else {
        setUserAddress(null);
        setUserCOAAddress(null);
        setPlans([]);
      }
    });
    return () => unsubscribe();
  }, [isMetamask]);

  // Handle Metamask wallet - fetch plans directly using EVM address
  useEffect(() => {
    if (!isMetamask || !isEvmConnected || !evmAddress) {
      if (isMetamask) {
        setPlans([]);
      }
      return;
    }

    // For Metamask users, their EVM address IS their user address
    setUserCOAAddress(evmAddress);
    fetchPlans(evmAddress);
  }, [isMetamask, isEvmConnected, evmAddress]);

  const fetchUserCOA = async (address: string) => {
    try {
      const coaAddress: string | null = await fcl.query({
        cadence: GET_USER_COA_SCRIPT,
        args: (arg, t) => [arg(address, t.Address)],
      });
      if (coaAddress) {
        setUserCOAAddress(coaAddress);
        fetchPlans(coaAddress);
      } else {
        setUserCOAAddress(null);
        setPlans([]);
      }
    } catch (error) {
      console.error("Error fetching COA:", error);
      setUserCOAAddress(null);
      setPlans([]);
    }
  };

  const fetchPlans = async (coaAddress: string) => {
    setLoading(true);
    setError(null);
    try {
      const evmPlans: EVMPlanData[] = await fcl.query({
        cadence: GET_USER_PLANS_SCRIPT,
        args: (arg, t) => [arg(coaAddress, t.String)],
      });

      console.log("Fetched EVM plans:", evmPlans);
      console.log("Current NETWORK:", NETWORK);
      console.log("EVM_TOKENS_BY_NETWORK:", EVM_TOKENS_BY_NETWORK);

      const transformedPlans: DCAPlan[] = evmPlans.map((p) => {
        console.log("Raw sourceTokenBytes:", p.sourceTokenBytes, typeof p.sourceTokenBytes[0]);
        const sourceTokenAddr = bytesToHex(p.sourceTokenBytes);
        const targetTokenAddr = bytesToHex(p.targetTokenBytes);
        console.log("Source token address:", sourceTokenAddr);
        console.log("Target token address:", targetTokenAddr);
        const sourceToken = getTokenSymbol(sourceTokenAddr);
        const targetToken = getTokenSymbol(targetTokenAddr);
        console.log("Source token symbol:", sourceToken);
        console.log("Target token symbol:", targetToken);

        // Convert interval to frequency label
        const intervalSec = parseInt(p.intervalSeconds);
        let frequency = "Custom";
        if (intervalSec === 60) frequency = "Minutely";
        else if (intervalSec === 3600) frequency = "Hourly";
        else if (intervalSec === 86400) frequency = "Daily";
        else if (intervalSec === 604800) frequency = "Weekly";

        // Convert status (0=Active, 1=Paused, 2=Completed, 3=Cancelled)
        const statusNum = parseInt(p.statusRaw);
        let status: "active" | "paused" | "completed" | "cancelled" = "active";
        if (statusNum === 1) status = "paused";
        else if (statusNum === 2) status = "completed";
        else if (statusNum === 3) status = "cancelled";

        // Convert amounts from wei to display units
        const amountWei = BigInt(p.amountPerInterval);
        const totalSpentWei = BigInt(p.totalSourceSpent);
        const totalReceivedWei = BigInt(p.totalTargetReceived);

        // Determine decimals based on token
        const sourceDecimals =
          sourceToken === "USDF" || sourceToken === "USDC" ? 6 : 18;
        const targetDecimals =
          targetToken === "USDF" || targetToken === "USDC" ? 6 : 18;

        // Helper function to convert BigInt wei to decimal string without precision loss
        const bigIntToDecimal = (value: bigint, decimals: number): string => {
          // Use BigInt exponentiation to avoid Number precision loss for 10^18
          const divisor = BigInt(10) ** BigInt(decimals);
          const wholePart = value / divisor;
          const fractionalPart = value % divisor;
          // Pad fractional part with leading zeros and take first 6 digits
          const fracStr = fractionalPart.toString().padStart(decimals, "0");
          return `${wholePart}.${fracStr.slice(0, 6)}`;
        };

        const amount = bigIntToDecimal(amountWei, sourceDecimals);
        const totalInvested = bigIntToDecimal(totalSpentWei, sourceDecimals);
        const totalAcquired = bigIntToDecimal(totalReceivedWei, targetDecimals);

        // Calculate average price
        let avgPrice = "0.000000";
        if (Number(totalInvested) > 0) {
          avgPrice = (Number(totalAcquired) / Number(totalInvested)).toFixed(8);
        }

        // Check if plan is stuck (active, execution time passed, but hasn't executed)
        const nextExecTime = parseFloat(p.nextExecutionTime || "0");
        const currentTime = Date.now() / 1000;
        const timeSinceExec = currentTime - nextExecTime;
        // Consider stuck if: active, next execution is set, more than 2 minutes have passed
        const isStuck =
          status === "active" &&
          nextExecTime > 0 &&
          timeSinceExec > 120; // 2 minutes grace period

        return {
          id: parseInt(p.id),
          amount,
          frequency,
          totalInvested,
          totalAcquired,
          avgPrice,
          sourceToken,
          targetToken,
          executionCount: parseInt(p.executionCount) || 0,
          maxExecutions: p.maxExecutions ? parseInt(p.maxExecutions) : null,
          status,
          nextExecution: p.nextExecutionTime || "0",
          createdAt: new Date(parseFloat(p.createdAt) * 1000)
            .toISOString()
            .split("T")[0],
          intervalSeconds: intervalSec,
          isStuck,
        };
      });

      // Sort by ID descending (newest first)
      const sortedPlans = transformedPlans.sort((a, b) => b.id - a.id);
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
      case "cancelled":
        return "bg-red-500 text-white";
      default:
        return "bg-gray-300 text-black";
    }
  };

  const getProgressPercentage = (plan: DCAPlan) => {
    if (!plan.maxExecutions) return null;
    return Math.round((plan.executionCount / plan.maxExecutions) * 100);
  };

  const handlePausePlan = async (planId: number) => {
    try {
      const response = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pausePlan",
          params: { planId },
          network: NETWORK,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Failed to pause plan:", error);
        alert(`Failed to pause: ${error.error || "Unknown error"}`);
        return;
      }

      if (userCOAAddress) {
        setTimeout(() => fetchPlans(userCOAAddress), 2000);
      }
    } catch (error) {
      console.error("Error pausing plan:", error);
      alert("Failed to pause plan. Please try again.");
    }
  };

  const handleResumePlan = async (planId: number) => {
    try {
      const response = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resumePlan",
          params: { planId },
          network: NETWORK,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Failed to resume plan:", error);
        alert(`Failed to resume: ${error.error || "Unknown error"}`);
        return;
      }

      if (userCOAAddress) {
        setTimeout(() => fetchPlans(userCOAAddress), 2000);
      }
    } catch (error) {
      console.error("Error resuming plan:", error);
      alert("Failed to resume plan. Please try again.");
    }
  };

  const handleReschedulePlan = async (planId: number) => {
    // Find the plan to get maxExecutions
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;

    const remainingExecutions = plan.maxExecutions
      ? plan.maxExecutions - plan.executionCount
      : 1; // Default to 1 if unlimited

    try {
      // First, reset the next execution time via relay API (works for both Metamask and Flow Wallet)
      const resumeResponse = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resumePlan",
          params: {
            planId,
            delaySeconds: 60.0, // 60 second delay for rescheduling
          },
          network: NETWORK,
        }),
      });

      if (!resumeResponse.ok) {
        const error = await resumeResponse.json();
        console.error("Failed to reset plan execution time:", error);
        alert(`Failed to resume plan: ${error.error || "Unknown error"}`);
        return;
      }

      // Then call the relay API to reschedule
      const scheduleResponse = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedulePlan",
          params: {
            planId,
            maxExecutions: remainingExecutions,
          },
          network: NETWORK,
        }),
      });

      if (!scheduleResponse.ok) {
        const error = await scheduleResponse.json();
        console.error("Failed to reschedule plan:", error);
        alert(`Failed to reschedule: ${error.error || "Unknown error"}`);
        return;
      }

      // Refresh plans after successful reschedule
      if (userCOAAddress) {
        setTimeout(() => fetchPlans(userCOAAddress), 3000);
      }

      alert(
        `Plan #${planId} has been rescheduled! Make sure you have approved enough ${plan.sourceToken} for the remaining executions.`
      );
    } catch (error) {
      console.error("Error rescheduling plan:", error);
      alert("Failed to reschedule plan. Please try again.");
    }
  };

  // Filter plans based on status
  const filteredPlans =
    statusFilter === "all"
      ? plans
      : plans.filter((p) => p.status === statusFilter);

  const activePlansCount = plans.filter((p) => p.status === "active").length;
  const completedPlansCount = plans.filter(
    (p) => p.status === "completed"
  ).length;
  const pausedPlansCount = plans.filter((p) => p.status === "paused").length;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Plans List */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">Your DCA Plans</h2>

          {/* Filter Tabs */}
          <div className="flex bg-gray-100 dark:bg-[#0a0a0a] rounded-lg p-1">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                statusFilter === "all"
                  ? "bg-white dark:bg-[#1a1a1a] shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              All ({plans.length})
            </button>
            <button
              onClick={() => setStatusFilter("active")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                statusFilter === "active"
                  ? "bg-white dark:bg-[#1a1a1a] shadow-sm text-[#00EF8B]"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              Active ({activePlansCount})
            </button>
            <button
              onClick={() => setStatusFilter("completed")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                statusFilter === "completed"
                  ? "bg-white dark:bg-[#1a1a1a] shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              Completed ({completedPlansCount})
            </button>
            <button
              onClick={() => setStatusFilter("paused")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                statusFilter === "paused"
                  ? "bg-white dark:bg-[#1a1a1a] shadow-sm text-yellow-500"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              Paused ({pausedPlansCount})
            </button>
          </div>
        </div>

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
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
              Error Loading Plans
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* No Wallet Connected State */}
        {!loading &&
          !error &&
          !userCOAAddress &&
          (isMetamask
            ? !isEvmConnected && (
                <div className="bg-white dark:bg-[#1a1a1a] border-2 border-dashed border-orange-300 dark:border-orange-800 rounded-xl p-12 text-center">
                  <h3 className="text-xl font-semibold mb-2">
                    Connect Metamask
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Connect your wallet using the button in the header to view
                    your DCA plans
                  </p>
                </div>
              )
            : userAddress && (
                <div className="bg-white dark:bg-[#1a1a1a] border-2 border-dashed border-gray-300 dark:border-[#2a2a2a] rounded-xl p-12 text-center">
                  <h3 className="text-xl font-semibold mb-2">
                    No EVM Account Found
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Setup your COA (Cadence Owned Account) to start using DCA
                  </p>
                </div>
              ))}

        {/* Empty State - No Plans At All */}
        {!loading && !error && userCOAAddress && plans.length === 0 && (
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
              Create your first DCA plan to start automating your investments
            </p>
          </div>
        )}

        {/* Empty State - No Plans Match Filter */}
        {!loading &&
          !error &&
          userCOAAddress &&
          plans.length > 0 &&
          filteredPlans.length === 0 && (
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
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              <h3 className="text-xl font-semibold mb-2">
                No {statusFilter} Plans
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                You don&apos;t have any {statusFilter} plans right now
              </p>
              <button
                onClick={() => setStatusFilter("all")}
                className="text-[#00EF8B] hover:underline font-medium"
              >
                View all plans
              </button>
            </div>
          )}

        {/* Plans List */}
        {!loading && !error && filteredPlans.length > 0 && (
          <div className="space-y-4">
            {filteredPlans.map((plan) => {
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
                          {formatAmount(plan.amount)} {plan.sourceToken} /{" "}
                          {plan.frequency}
                        </p>
                        <div className="flex items-center gap-1 text-xs mt-1">
                          <span
                            className={
                              plan.sourceToken === "FLOW"
                                ? "text-[#00EF8B] font-medium"
                                : "text-blue-500 font-medium"
                            }
                          >
                            {plan.sourceToken}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span
                            className={
                              plan.targetToken === "FLOW"
                                ? "text-[#00EF8B] font-medium"
                                : "text-blue-500 font-medium"
                            }
                          >
                            {plan.targetToken}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {plan.isStuck ? (
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-500 text-white">
                          NEEDS ATTENTION
                        </span>
                      ) : (
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            plan.status
                          )}`}
                        >
                          {plan.status.toUpperCase()}
                        </span>
                      )}
                      {plan.status === "active" && !plan.isStuck && (
                        <button
                          onClick={() => handlePausePlan(plan.id)}
                          className="px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 text-yellow-800 dark:text-yellow-200 rounded-lg text-sm font-medium cursor-pointer"
                        >
                          Pause
                        </button>
                      )}
                      {plan.status === "paused" && (
                        <button
                          onClick={() => handleResumePlan(plan.id)}
                          className="px-4 py-2 bg-[#00EF8B] hover:bg-[#00D9FF] text-black rounded-lg text-sm font-medium cursor-pointer"
                        >
                          Resume
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stuck Plan Warning */}
                  {plan.isStuck && (
                    <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div className="flex-1">
                          <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-1">
                            Execution Failed - Likely Insufficient Allowance
                          </h4>
                          <p className="text-sm text-orange-700 dark:text-orange-300 mb-3">
                            This plan tried to execute but failed. This usually happens when your token allowance is less than the amount needed per execution ({formatAmount(plan.amount)} {plan.sourceToken}).
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <a
                              href="/"
                              onClick={(e) => {
                                e.preventDefault();
                                // Switch to Create tab to show approval UI
                                window.location.href = "/?tab=create";
                              }}
                              className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-sm font-medium"
                            >
                              Approve More {plan.sourceToken}
                            </a>
                            <button
                              onClick={() => handleReschedulePlan(plan.id)}
                              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-orange-300 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-md text-sm font-medium"
                            >
                              Reschedule Plan
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

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
                        {formatAmount(plan.totalInvested)}
                        <span
                          className={`text-sm ml-1 ${
                            plan.sourceToken === "FLOW"
                              ? "text-[#00EF8B]"
                              : "text-blue-500"
                          }`}
                        >
                          {plan.sourceToken}
                        </span>
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Total Acquired
                      </p>
                      <p className="text-lg font-bold font-mono">
                        {formatAmount(plan.totalAcquired)}
                        <span
                          className={`text-sm ml-1 ${
                            plan.targetToken === "FLOW"
                              ? "text-[#00EF8B]"
                              : "text-blue-500"
                          }`}
                        >
                          {plan.targetToken}
                        </span>
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Avg Price
                      </p>
                      <p className="text-lg font-bold font-mono">
                        {formatAmount(plan.avgPrice, 6)}
                        <span className="text-sm text-gray-500 ml-1">
                          {plan.targetToken}/{plan.sourceToken}
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
                          if (userCOAAddress) {
                            fetchPlans(userCOAAddress);
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
