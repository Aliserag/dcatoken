"use client";

import { useState } from "react";

export function DCAHeader() {
  const [isConnected, setIsConnected] = useState(false);
  const [userAddress, setUserAddress] = useState("");

  const connectWallet = async () => {
    // TODO: Integrate with FCL
    setIsConnected(true);
    setUserAddress("0xf8d6e058...20c7");
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setUserAddress("");
  };

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
                    <span className="text-sm font-mono">{userAddress}</span>
                  </div>
                  <div className="w-px h-6 bg-gray-200 dark:bg-[#2a2a2a]" />
                  <div className="text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      Balance:{" "}
                    </span>
                    <span className="font-bold font-mono">123.45 FLOW</span>
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
                className="bg-[#00EF8B] hover:bg-[#00D57A] text-black font-bold px-6 py-3 rounded-xl transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-[#00EF8B]/30"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
