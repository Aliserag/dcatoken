"use client";

import { useState, useEffect } from "react";

interface FlowPriceData {
  usd: number;
  usdt: number;
  lastUpdated: number;
}

// Fallback price when API is unavailable
const FALLBACK_FLOW_PRICE = 0.45;

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
        console.warn("Error fetching FLOW price, using fallback:", err);
        // Use fallback price so UI still works
        setPriceData({
          usd: FALLBACK_FLOW_PRICE,
          usdt: FALLBACK_FLOW_PRICE,
          lastUpdated: Date.now() / 1000,
        });
        setError(null); // Don't show error for fallback
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
