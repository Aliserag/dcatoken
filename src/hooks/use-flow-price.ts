"use client";

import { useState, useEffect } from "react";

interface FlowPriceData {
  usd: number;
  usdt: number;
  lastUpdated: number;
}

/**
 * Hook to fetch FLOW price in USDT from CoinGecko API
 * Used for display purposes only - actual swaps use USDC via IncrementFi
 */
export function useFlowPrice() {
  const [priceData, setPriceData] = useState<FlowPriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=flow&vs_currencies=usd,usdt&include_last_updated_at=true"
        );

        if (!response.ok) {
          throw new Error("Failed to fetch price");
        }

        const data = await response.json();

        if (data.flow) {
          setPriceData({
            usd: data.flow.usd,
            usdt: data.flow.usdt || data.flow.usd, // Fallback to USD if USDT not available
            lastUpdated: data.flow.last_updated_at || Date.now() / 1000,
          });
          setError(null);
        }
      } catch (err: any) {
        console.error("Error fetching FLOW price:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // Fetch immediately
    fetchPrice();

    // Refresh every 30 seconds
    const interval = setInterval(fetchPrice, 30000);

    return () => clearInterval(interval);
  }, []);

  return { priceData, loading, error };
}
