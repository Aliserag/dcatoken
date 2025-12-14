"use client";

import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState, useMemo } from "react";
import { NETWORK } from "@/config/fcl-config";

// Define Flow EVM mainnet chain
const flowMainnet = {
  id: 747,
  name: "Flow EVM",
  nativeCurrency: {
    decimals: 18,
    name: "Flow",
    symbol: "FLOW",
  },
  rpcUrls: {
    default: {
      http: ["https://mainnet.evm.nodes.onflow.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "FlowDiver",
      url: "https://evm.flowscan.io",
    },
  },
} as const;

// Define Flow EVM testnet chain
const flowTestnet = {
  id: 545,
  name: "Flow EVM Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Flow",
    symbol: "FLOW",
  },
  rpcUrls: {
    default: {
      http: ["https://testnet.evm.nodes.onflow.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "FlowDiver Testnet",
      url: "https://evm-testnet.flowscan.io",
    },
  },
  testnet: true,
} as const;

// Get the active chain based on network setting
const activeChain = NETWORK === "testnet" ? flowTestnet : flowMainnet;

// Create wagmi config for Flow EVM with both chains
const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [
    injected({
      target: "metaMask",
    }),
  ],
  transports: {
    [flowMainnet.id]: http(),
    [flowTestnet.id]: http(),
  },
});

interface EVMProviderProps {
  children: ReactNode;
}

export function EVMProvider({ children }: EVMProviderProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Export chains and config for use elsewhere
export { flowMainnet, flowTestnet, activeChain, wagmiConfig };
