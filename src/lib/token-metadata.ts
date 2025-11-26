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
 */
export function getTokenColor(symbol: string): string {
  const colorMap: Record<string, string> = {
    FLOW: "#00EF8B",
    USDC: "#2775CA",
    USDT: "#26A17B",
    stFLOW: "#7FFFC4",
    BEAVER: "#8B4513",
    DUC: "#FFD700",
    COW: "#654321",
  };

  return colorMap[symbol] || "#9CA3AF";
}
