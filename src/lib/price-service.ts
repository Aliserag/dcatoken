/**
 * Price Service
 *
 * Fetches real-time token prices from CoinGecko API
 * Used for accurate price display in the DCA interface
 */

import { getCoinGeckoId } from './token-metadata';

interface TokenPrice {
  symbol: string;
  usd: number;
  timestamp: number;
}

interface CoinGeckoResponse {
  [key: string]: {
    usd: number;
  };
}

// Helper to get CoinGecko ID - uses TOKEN_REGISTRY from token-metadata
// To add new tokens, update TOKEN_REGISTRY in token-metadata.ts
const getGeckoId = (symbol: string): string => getCoinGeckoId(symbol);

// Cache for prices
const priceCache: Map<string, TokenPrice> = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch prices for multiple tokens from CoinGecko
 */
export async function getTokenPrices(symbols: string[]): Promise<Record<string, number>> {
  const now = Date.now();
  const result: Record<string, number> = {};
  const symbolsToFetch: string[] = [];

  // Check cache first
  for (const symbol of symbols) {
    const cached = priceCache.get(symbol);
    if (cached && now - cached.timestamp < CACHE_DURATION) {
      result[symbol] = cached.usd;
    } else if (getGeckoId(symbol)) {
      symbolsToFetch.push(symbol);
    }
  }

  // Fetch uncached prices
  if (symbolsToFetch.length > 0) {
    try {
      const coinIds = symbolsToFetch
        .map(s => getGeckoId(s))
        .filter(Boolean)
        .join(',');

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data: CoinGeckoResponse = await response.json();

      // Update cache and result
      for (const symbol of symbolsToFetch) {
        const coinId = getGeckoId(symbol);
        if (coinId && data[coinId]) {
          const price: TokenPrice = {
            symbol,
            usd: data[coinId].usd,
            timestamp: now,
          };
          priceCache.set(symbol, price);
          result[symbol] = price.usd;
        }
      }
    } catch (error) {
      console.error('Failed to fetch prices from CoinGecko:', error);

      // Return stale cached prices if available
      for (const symbol of symbolsToFetch) {
        const cached = priceCache.get(symbol);
        if (cached) {
          result[symbol] = cached.usd;
        }
      }
    }
  }

  return result;
}

/**
 * Calculate exchange rate between two tokens
 * @returns How many units of toToken you get for 1 unit of fromToken
 */
export function calculateExchangeRate(
  fromSymbol: string,
  toSymbol: string,
  prices: Record<string, number>
): number {
  const fromPrice = prices[fromSymbol];
  const toPrice = prices[toSymbol];

  if (!fromPrice || !toPrice || toPrice === 0) {
    return 0;
  }

  // e.g., USDC ($1) -> FLOW ($0.20) = 1 / 0.20 = 5 FLOW per USDC
  return fromPrice / toPrice;
}

/**
 * Get a single token's USD price
 */
export async function getTokenPrice(symbol: string): Promise<number | null> {
  const prices = await getTokenPrices([symbol]);
  return prices[symbol] ?? null;
}

/**
 * Check if cached price is stale
 */
export function isPriceStale(symbol: string): boolean {
  const cached = priceCache.get(symbol);
  if (!cached) return true;
  return Date.now() - cached.timestamp > CACHE_DURATION;
}

/**
 * Get cache timestamp for a symbol
 */
export function getPriceTimestamp(symbol: string): number | null {
  const cached = priceCache.get(symbol);
  return cached?.timestamp ?? null;
}
