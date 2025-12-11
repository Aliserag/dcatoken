/**
 * Token Metadata Types
 *
 * TypeScript interfaces for IncrementFi token information
 */

export interface TokenInfo {
  symbol: string;
  tokenAddress: string;
  tokenContract: string;
  tokenIdentifier: string;
  pairAddress: string;
  flowReserve: string;
  tokenReserve: string;
  isStable: boolean;
}

/**
 * Token Configuration Interface
 * Centralized configuration for each supported token
 */
export interface TokenConfig {
  symbol: string;
  name: string;
  coingeckoId: string;
  logoUrl: string;
  color: string;
  contractIdentifier: string; // Pattern to match in Cadence type identifier
  decimals: number;
}

/**
 * Centralized Token Registry
 * Add new tokens here to extend the application
 */
export const TOKEN_REGISTRY: Record<string, TokenConfig> = {
  FLOW: {
    symbol: 'FLOW',
    name: 'Flow',
    coingeckoId: 'flow',
    logoUrl: 'https://cryptologos.cc/logos/flow-flow-logo.png',
    color: '#00EF8B',
    contractIdentifier: 'FlowToken',
    decimals: 8,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    coingeckoId: 'usd-coin',
    logoUrl: 'https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    color: '#2775CA',
    contractIdentifier: 'EVMVMBridgedToken',
    decimals: 6,
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether',
    coingeckoId: 'tether',
    logoUrl: 'https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    color: '#26A17B',
    contractIdentifier: 'TeleportedTetherToken',
    decimals: 6,
  },
  stFLOW: {
    symbol: 'stFLOW',
    name: 'Staked Flow',
    coingeckoId: 'staked-flow',
    logoUrl: 'https://cryptologos.cc/logos/flow-flow-logo.png',
    color: '#7FFFC4',
    contractIdentifier: 'stFlowToken',
    decimals: 8,
  },
  USDF: {
    symbol: 'USDF',
    name: 'USD Flow',
    coingeckoId: 'usd-coin', // Use USDC price as proxy (both are $1 stablecoins)
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6c3ea9036406852006290770BEdFcAbA0e23A0e8/logo.png', // PYUSD logo (similar stablecoin)
    color: '#00D4AA', // Teal/green to distinguish from USDC blue
    contractIdentifier: 'EVMVMBridgedToken_2aabea2058b5ac2d339b163c6ab6f2b6d53aabed',
    decimals: 6,
  },
};

/**
 * Tokens allowed for trading in DCA plans
 * Add token symbols here to enable them in the create plan dropdown
 */
export const ALLOWED_TRADING_TOKENS: string[] = ['USDC', 'USDF'];

/**
 * Get token symbol from a Cadence type identifier
 * e.g., "A.1654653399040a61.FlowToken.Vault" -> "FLOW"
 */
export function getTokenSymbolFromTypeId(typeId: string): string {
  for (const [symbol, config] of Object.entries(TOKEN_REGISTRY)) {
    if (typeId.includes(config.contractIdentifier)) {
      return symbol;
    }
  }
  return 'TOKEN';
}

/**
 * Get token config by symbol
 */
export function getTokenConfig(symbol: string): TokenConfig | undefined {
  return TOKEN_REGISTRY[symbol];
}

/**
 * Get CoinGecko ID for a token symbol
 */
export function getCoinGeckoId(symbol: string): string {
  return TOKEN_REGISTRY[symbol]?.coingeckoId || symbol.toLowerCase();
}

/**
 * Format token reserve as human-readable number
 */
export function formatReserve(reserve: string): string {
  const num = parseFloat(reserve);
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  } else {
    return num.toFixed(2);
  }
}

/**
 * Calculate approximate exchange rate
 */
export function calculateExchangeRate(
  flowReserve: string,
  tokenReserve: string
): string {
  const flowAmount = parseFloat(flowReserve);
  const tokenAmount = parseFloat(tokenReserve);

  if (flowAmount === 0 || tokenAmount === 0) {
    return "0.00";
  }

  const rate = tokenAmount / flowAmount;
  return rate.toFixed(4);
}

/**
 * Get display name for token dropdown
 */
export function getTokenDisplayName(token: TokenInfo): string {
  const liquidity = formatReserve(token.flowReserve);
  const rate = calculateExchangeRate(token.flowReserve, token.tokenReserve);
  return `${token.symbol} (${liquidity} FLOW liquidity • ~${rate} ${token.symbol}/FLOW)`;
}

/**
 * Sort tokens by liquidity (highest first)
 */
export function sortTokensByLiquidity(tokens: TokenInfo[]): TokenInfo[] {
  return [...tokens].sort((a, b) => {
    const liquidityA = parseFloat(a.flowReserve);
    const liquidityB = parseFloat(b.flowReserve);
    return liquidityB - liquidityA;
  });
}

/**
 * Filter tokens with minimum liquidity threshold
 */
export function filterByMinLiquidity(
  tokens: TokenInfo[],
  minFlowLiquidity: number = 100
): TokenInfo[] {
  return tokens.filter((token) => {
    const liquidity = parseFloat(token.flowReserve);
    return liquidity >= minFlowLiquidity;
  });
}

/**
 * Common token symbols for quick reference
 */
export const COMMON_TOKENS = {
  FLOW: "FlowToken",
  USDC: "FiatToken",
  USDT: "TeleportedTetherToken",
  stFLOW: "stFlowToken",
  BEAVER: "BeaverToken",
  DUC: "DucToken",
  COW: "CowToken",
} as const;

/**
 * Get token icon/color for UI
 * Uses TOKEN_REGISTRY as primary source, with fallback for unlisted tokens
 */
export function getTokenColor(symbol: string): string {
  // Use registry first
  if (TOKEN_REGISTRY[symbol]) {
    return TOKEN_REGISTRY[symbol].color;
  }

  // Fallback for tokens not in registry
  const fallbackColors: Record<string, string> = {
    BEAVER: "#8B4513",
    DUC: "#FFD700",
    COW: "#654321",
  };

  return fallbackColors[symbol] || "#9CA3AF";
}

/**
 * Get token logo URL
 * Uses TOKEN_REGISTRY as primary source, with fallback for unlisted tokens
 */
export function getTokenLogoUrl(symbol: string, tokenAddress?: string): string {
  // Use registry first
  if (TOKEN_REGISTRY[symbol]) {
    return TOKEN_REGISTRY[symbol].logoUrl;
  }

  // No fallback - return empty string for unknown tokens
  return "";
}
