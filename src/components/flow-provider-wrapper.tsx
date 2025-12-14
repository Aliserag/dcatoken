"use client";

import { FlowProvider } from "@onflow/react-sdk";
import { ReactNode, useEffect } from "react";
import flowJSON from "../../flow.json";
import { configureFCL, NETWORK } from "@/config/fcl-config";

interface FlowProviderWrapperProps {
  children: ReactNode;
}

// Network-specific configuration
const NETWORK_CONFIG = {
  emulator: {
    accessNodeUrl: "http://127.0.0.1:8888",
    discoveryWallet: "http://localhost:8701/fcl/authn",
    discoveryAuthnEndpoint: "http://localhost:8701/fcl/authn",
  },
  testnet: {
    accessNodeUrl: "https://rest-testnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
    discoveryAuthnEndpoint: "https://fcl-discovery.onflow.org/api/testnet/authn",
  },
  mainnet: {
    accessNodeUrl: "https://rest-mainnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/authn",
    discoveryAuthnEndpoint: "https://fcl-discovery.onflow.org/api/authn",
  },
};

export function FlowProviderWrapper({ children }: FlowProviderWrapperProps) {
  useEffect(() => {
    configureFCL();
  }, []);

  const networkConfig = NETWORK_CONFIG[NETWORK] || NETWORK_CONFIG.mainnet;

  return (
    <FlowProvider
      config={{
        // Network configuration - dynamically set based on environment
        accessNodeUrl: networkConfig.accessNodeUrl,
        discoveryWallet: networkConfig.discoveryWallet,
        discoveryAuthnEndpoint: networkConfig.discoveryAuthnEndpoint,
        flowNetwork: NETWORK,

        // App metadata
        appDetailTitle: "Flow DCA - Dollar-Cost Averaging",
        appDetailUrl:
          typeof window !== "undefined" ? window.location.origin : "",
        appDetailIcon:
          typeof window !== "undefined"
            ? `${window.location.origin}/logo.png`
            : "",
        appDetailDescription:
          "Automate your Flow investments with smart, scheduled DCA strategies using Forte features",

        // Optional configuration
        computeLimit: 1000,
        walletconnectProjectId: "9b70cfa398b2355a5eb9b1cf99f4a981",
      }}
      flowJson={flowJSON}
    >
      {children}
    </FlowProvider>
  );
}
