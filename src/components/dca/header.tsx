"use client";

import { useEffect, useState, useRef } from "react";
import * as fcl from "@onflow/fcl";
import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi";
import { injected } from "wagmi/connectors";
import { useWalletType } from "@/components/wallet-selector";
import { NETWORK } from "@/config/fcl-config";

export function DCAHeader() {
  const { walletType, setWalletType, isMetamask, isFlow } = useWalletType();

  // Flow wallet state
  const [flowAddress, setFlowAddress] = useState<string | null>(null);
  const [flowBalance, setFlowBalance] = useState<string>("0.00");
  const [isLoading, setIsLoading] = useState(false);
  const [showTestnetInfo, setShowTestnetInfo] = useState(false);
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isTestnet = NETWORK === "testnet";
  const isMainnet = NETWORK === "mainnet";

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNetworkDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const switchNetwork = (network: "testnet" | "mainnet") => {
    if (network === NETWORK) {
      setShowNetworkDropdown(false);
      return;
    }
    // Store preference and reload to apply new network config
    localStorage.setItem("preferred_network", network);
    window.location.href = `/?network=${network}`;
  };

  // Metamask wallet state (wagmi hooks)
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount();
  const { connect: connectMetamask, isPending: isMetamaskConnecting } = useConnect();
  const { disconnect: disconnectMetamask } = useDisconnect();
  const { data: evmBalanceData } = useBalance({
    address: evmAddress,
  });

  // Subscribe to Flow user authentication state
  useEffect(() => {
    const unsubscribe = fcl.currentUser.subscribe((currentUser) => {
      if (currentUser && currentUser.addr) {
        setFlowAddress(currentUser.addr);
        fetchFlowBalance(currentUser.addr);
      } else {
        setFlowAddress(null);
        setFlowBalance("0.00");
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchFlowBalance = async (address: string) => {
    try {
      const result = await fcl.query({
        cadence: `
          import FlowToken from 0xFlowToken
          import FungibleToken from 0xFungibleToken

          access(all) fun main(address: Address): UFix64 {
            let account = getAccount(address)
            let vaultRef = account.capabilities
              .get<&FlowToken.Vault>(/public/flowTokenBalance)
              .borrow()
              ?? panic("Could not borrow Balance reference")

            return vaultRef.balance
          }
        `,
        args: (arg, t) => [arg(address, t.Address)],
      });
      setFlowBalance(parseFloat(result).toFixed(2));
    } catch (error) {
      console.error("Error fetching balance:", error);
      setFlowBalance("0.00");
    }
  };

  const connectFlowWallet = async () => {
    setIsLoading(true);
    try {
      await fcl.authenticate();
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectFlowWallet = () => {
    fcl.unauthenticate();
  };

  const handleConnect = () => {
    if (isMetamask) {
      connectMetamask({ connector: injected() });
    } else {
      connectFlowWallet();
    }
  };

  const handleDisconnect = () => {
    if (isMetamask) {
      disconnectMetamask();
    } else {
      disconnectFlowWallet();
    }
  };

  // Determine current connection state based on wallet type
  const isConnected = isMetamask ? isEvmConnected : flowAddress !== null;
  const currentAddress = isMetamask ? evmAddress : flowAddress;
  const currentBalance = isMetamask
    ? (evmBalanceData ? (Number(evmBalanceData.value) / 10 ** evmBalanceData.decimals).toFixed(2) : "0.00")
    : flowBalance;
  const isConnecting = isMetamask ? isMetamaskConnecting : isLoading;

  const shortAddress = currentAddress
    ? `${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}`
    : "";

  return (
    <>
      {/* Testnet Banner */}
      {isTestnet && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30">
          <div className="container mx-auto px-4 py-2">
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                You are on Testnet
              </span>
              <span className="text-gray-500">•</span>
              <button
                onClick={() => setShowTestnetInfo(!showTestnetInfo)}
                className="text-yellow-600 dark:text-yellow-400 hover:underline font-medium cursor-pointer"
              >
                {showTestnetInfo ? "Hide" : "Get"} testnet tokens
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Testnet Info Panel */}
      {isTestnet && showTestnetInfo && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="container mx-auto px-4 py-4">
            <div className="max-w-2xl mx-auto">
              <h3 className="font-bold text-yellow-800 dark:text-yellow-200 mb-3">
                Getting Started on Testnet
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">1️⃣</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Get Test FLOW</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Get free testnet FLOW tokens from the official faucet.
                  </p>
                  <a
                    href="https://faucet.flow.com/fund-account"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#00EF8B] hover:bg-[#00D57A] text-black font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Flow Faucet
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
                <div className="bg-white dark:bg-[#1a1a1a] rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">2️⃣</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Swap for Other Tokens</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Swap your FLOW for WFLOW or other tokens on FlowSwap.
                  </p>
                  <a
                    href="https://flowswap.io/?intro=true"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    FlowSwap
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
                Testnet tokens have no real value and are for testing purposes only.
              </p>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-gray-200 dark:border-[#2a2a2a]">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-[#00EF8B] blur-xl opacity-50 rounded-full" />
                <div className="relative bg-gradient-to-br from-[#00EF8B] to-[#7FFFC4] p-2 rounded-xl">
                  <svg
                    className="w-8 h-8 text-black"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 18c-3.86-.92-7-5.29-7-9V8.43l7-3.5 7 3.5V11c0 3.71-3.14 8.08-7 9z" />
                  </svg>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-[#00EF8B] to-[#7FFFC4] bg-clip-text text-transparent">
                    Flow DCA
                  </h1>
                  {/* Network Switcher */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
                      className={`flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full cursor-pointer transition-all hover:scale-105 ${
                        isTestnet
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/70"
                          : isMainnet
                          ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/70"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {NETWORK.toUpperCase()}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {/* Dropdown Menu */}
                    {showNetworkDropdown && (
                      <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] rounded-lg shadow-lg z-50 min-w-[140px] overflow-hidden">
                        <button
                          onClick={() => switchNetwork("mainnet")}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                            isMainnet
                              ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                              : "hover:bg-gray-50 dark:hover:bg-[#2a2a2a] text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${isMainnet ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                          Mainnet
                          {isMainnet && (
                            <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => switchNetwork("testnet")}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                            isTestnet
                              ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                              : "hover:bg-gray-50 dark:hover:bg-[#2a2a2a] text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${isTestnet ? "bg-yellow-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                          Testnet
                          {isTestnet && (
                            <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Smart Investing, Automated
                </p>
              </div>
            </div>

          {/* Wallet Connection */}
          <div className="flex items-center gap-3">
            {isConnected ? (
              <>
                <div className="hidden md:flex items-center gap-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${isMetamask ? 'bg-orange-500' : 'bg-[#00EF8B]'}`} />
                    <span className="text-sm font-mono">{shortAddress}</span>
                  </div>
                  <div className="w-px h-6 bg-gray-200 dark:bg-[#2a2a2a]" />
                  <div className="text-sm">
                    <span className="font-bold font-mono">{currentBalance} FLOW</span>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-gray-100 dark:bg-[#2a2a2a] hover:bg-gray-200 dark:hover:bg-[#3a3a3a] rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setWalletType("flow");
                    setTimeout(() => connectFlowWallet(), 100);
                  }}
                  disabled={isLoading}
                  className="bg-[#00EF8B] hover:bg-[#00D57A] disabled:bg-gray-400 disabled:cursor-not-allowed text-black font-bold px-5 py-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#00EF8B]/30 cursor-pointer"
                >
                  {isLoading && isFlow ? "Connecting..." : "Flow Wallet"}
                </button>
                <button
                  onClick={() => {
                    setWalletType("metamask");
                    setTimeout(() => connectMetamask({ connector: injected() }), 100);
                  }}
                  disabled={isMetamaskConnecting}
                  className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-orange-500/30 cursor-pointer"
                >
                  {isMetamaskConnecting ? "Connecting..." : "Metamask"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
    </>
  );
}
