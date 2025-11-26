"use client";

import { useFlow } from "@onflow/react-sdk";
import { useEffect, useState } from "react";
import * as fcl from "@onflow/fcl";

export function DCAHeader() {
  const { user } = useFlow();
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>("0.00");
  const [isLoading, setIsLoading] = useState(false);

  // Subscribe to user authentication state
  useEffect(() => {
    const unsubscribe = fcl.currentUser.subscribe((currentUser) => {
      if (currentUser && currentUser.addr) {
        setUserAddress(currentUser.addr);
        fetchBalance(currentUser.addr);
      } else {
        setUserAddress(null);
        setBalance("0.00");
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchBalance = async (address: string) => {
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
      setBalance(parseFloat(result).toFixed(2));
    } catch (error) {
      console.error("Error fetching balance:", error);
      setBalance("0.00");
    }
  };

  const connectWallet = async () => {
    setIsLoading(true);
    try {
      await fcl.authenticate();
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectWallet = () => {
    fcl.unauthenticate();
  };

  const isConnected = userAddress !== null;
  const shortAddress = userAddress
    ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`
    : "";

  return (
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
              <h1 className="text-2xl font-bold bg-gradient-to-r from-[#00EF8B] to-[#7FFFC4] bg-clip-text text-transparent">
                Flow DCA
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Smart Investing, Automated
              </p>
            </div>
          </div>

          {/* Wallet Connection */}
          <div className="flex items-center gap-4">
            {isConnected ? (
              <>
                <div className="hidden md:flex items-center gap-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#00EF8B] rounded-full animate-pulse" />
                    <span className="text-sm font-mono">{shortAddress}</span>
                  </div>
                  <div className="w-px h-6 bg-gray-200 dark:bg-[#2a2a2a]" />
                  <div className="text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      Balance:{" "}
                    </span>
                    <span className="font-bold font-mono">{balance} FLOW</span>
                  </div>
                </div>
                <button
                  onClick={disconnectWallet}
                  className="px-4 py-2 bg-gray-100 dark:bg-[#2a2a2a] hover:bg-gray-200 dark:hover:bg-[#3a3a3a] rounded-xl text-sm font-medium transition-colors"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isLoading}
                className="bg-[#00EF8B] hover:bg-[#00D57A] disabled:bg-gray-400 disabled:cursor-not-allowed text-black font-bold px-6 py-3 rounded-xl transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-[#00EF8B]/30 disabled:shadow-none disabled:transform-none"
              >
                {isLoading ? "Connecting..." : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
