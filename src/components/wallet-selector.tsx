"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from "react";

export type WalletType = "flow" | "metamask";

interface WalletContextType {
  walletType: WalletType;
  setWalletType: (type: WalletType) => void;
  isMetamask: boolean;
  isFlow: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const WALLET_TYPE_KEY = "dca_wallet_type";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletType, setWalletTypeState] = useState<WalletType>("flow");

  // Load preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(WALLET_TYPE_KEY);
    if (stored === "flow" || stored === "metamask") {
      setWalletTypeState(stored);
    }
  }, []);

  const setWalletType = (type: WalletType) => {
    setWalletTypeState(type);
    localStorage.setItem(WALLET_TYPE_KEY, type);
  };

  return (
    <WalletContext.Provider
      value={{
        walletType,
        setWalletType,
        isMetamask: walletType === "metamask",
        isFlow: walletType === "flow",
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletType() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletType must be used within WalletProvider");
  }
  return context;
}

interface WalletSelectorProps {
  className?: string;
}

export function WalletSelector({ className = "" }: WalletSelectorProps) {
  const { walletType, setWalletType } = useWalletType();

  return (
    <div className={`flex gap-2 ${className}`}>
      <button
        onClick={() => setWalletType("flow")}
        className={`px-4 py-2 rounded-lg font-medium transition-all ${
          walletType === "flow"
            ? "bg-green-500 text-white"
            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
        }`}
      >
        Flow Wallet
      </button>
      <button
        onClick={() => setWalletType("metamask")}
        className={`px-4 py-2 rounded-lg font-medium transition-all ${
          walletType === "metamask"
            ? "bg-orange-500 text-white"
            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
        }`}
      >
        Metamask
      </button>
    </div>
  );
}
