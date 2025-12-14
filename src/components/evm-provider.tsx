"use client";

import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

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

// Create wagmi config for Flow EVM
const wagmiConfig = createConfig({
  chains: [flowMainnet],
  connectors: [
    injected({
      target: "metaMask",
    }),
  ],
  transports: {
    [flowMainnet.id]: http(),
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

// Export chain and config for use elsewhere
export { flowMainnet, wagmiConfig };
