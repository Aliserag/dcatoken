"use client";

import { FlowProvider } from "@onflow/react-sdk";
import { ReactNode, useEffect } from "react";
import flowJSON from "../../flow.json";
import { configureFCL, NETWORK } from "@/config/fcl-config";

interface FlowProviderWrapperProps {
  children: ReactNode;
}

export function FlowProviderWrapper({ children }: FlowProviderWrapperProps) {
  useEffect(() => {
    configureFCL();
  }, []);

  const isEmulator = NETWORK === "emulator";

  return (
    <FlowProvider
      config={{
        // Network configuration - dynamically set based on environment
        accessNodeUrl: isEmulator
          ? "http://127.0.0.1:8888"
          : "https://rest-testnet.onflow.org",
        discoveryWallet: isEmulator
          ? "http://localhost:8701/fcl/authn"
          : "https://fcl-discovery.onflow.org/testnet/authn",
        discoveryAuthnEndpoint: isEmulator
          ? "http://localhost:8701/fcl/authn"
          : "https://fcl-discovery.onflow.org/api/testnet/authn",
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
