import * as fcl from "@onflow/fcl";

// Flow configuration for different networks
const NETWORK = process.env.NEXT_PUBLIC_FLOW_NETWORK || "emulator";

// Network configurations
const networkConfigs = {
  emulator: {
    accessNode: "http://127.0.0.1:8888",
    discoveryWallet: "http://localhost:8701/fcl/authn",
    // Emulator contract addresses (from flow.json)
    contracts: {
      DCAController: "0xf8d6e0586b0a20c7",
      DCAPlan: "0xf8d6e0586b0a20c7",
      DeFiMath: "0xf8d6e0586b0a20c7",
      ScheduledHandler: "0xf8d6e0586b0a20c7",
      IncrementRoutes: "0xf8d6e0586b0a20c7",
      FlowToken: "0x0ae53cb6e3f42a79",
      FungibleToken: "0xee82856bf20e2aa6",
    },
  },
  testnet: {
    accessNode: "https://rest-testnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
    contracts: {
      DCAController: process.env.NEXT_PUBLIC_DCA_CONTROLLER_ADDRESS || "",
      DCAPlan: process.env.NEXT_PUBLIC_DCA_PLAN_ADDRESS || "",
      DeFiMath: process.env.NEXT_PUBLIC_DEFI_MATH_ADDRESS || "",
      ScheduledHandler: process.env.NEXT_PUBLIC_SCHEDULED_HANDLER_ADDRESS || "",
      IncrementRoutes: process.env.NEXT_PUBLIC_INCREMENT_ROUTES_ADDRESS || "",
      FlowToken: "0x7e60df042a9c0868",
      FungibleToken: "0x9a0766d93b6608b7",
    },
  },
  mainnet: {
    accessNode: "https://rest-mainnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/authn",
    contracts: {
      DCAController: "",
      DCAPlan: "",
      DeFiMath: "",
      ScheduledHandler: "",
      IncrementRoutes: "",
      FlowToken: "0x1654653399040a61",
      FungibleToken: "0xf233dcee88fe0abe",
    },
  },
};

const config = networkConfigs[NETWORK as keyof typeof networkConfigs] || networkConfigs.emulator;

// Configure FCL
fcl
  .config()
  .put("app.detail.title", "DCA Token - Dollar Cost Averaging on Flow")
  .put("app.detail.icon", "https://placekitten.com/g/200/200")
  .put("flow.network", NETWORK)
  .put("accessNode.api", config.accessNode)
  .put("discovery.wallet", config.discoveryWallet)
  // Contract addresses
  .put("0xDCAController", config.contracts.DCAController)
  .put("0xDCAPlan", config.contracts.DCAPlan)
  .put("0xDeFiMath", config.contracts.DeFiMath)
  .put("0xScheduledHandler", config.contracts.ScheduledHandler)
  .put("0xIncrementRoutes", config.contracts.IncrementRoutes)
  .put("0xFlowToken", config.contracts.FlowToken)
  .put("0xFungibleToken", config.contracts.FungibleToken);

export { fcl, config };
export default fcl;
