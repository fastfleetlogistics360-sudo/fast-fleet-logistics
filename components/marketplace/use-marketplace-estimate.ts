"use client";

import { useEffect, useState } from "react";

export type MarketplaceEstimateItem = {
  name?: string;
  store?: string;
  storeAddress?: string;
  pickupAddress?: string;
  mallLocation?: string;
  quantity?: number;
  price?: number;
  subtotal?: number;
  businessId?: string;
  storeId?: string;
  productId?: string;
  productName?: string;
  mallId?: string;
  mallName?: string;
  vendorId?: string;
  vendorName?: string;
  category?: string;
};

export type MarketplaceEstimate = {
  itemsTotal: number;
  deliveryFee: number;
  platformFee: number;
  total: number;
  distanceKm: number;
  etaMinutes: number;
};

export function useMarketplaceEstimate({
  kind,
  address,
  items
}: {
  kind: "restaurant" | "shopping";
  address: string;
  items: MarketplaceEstimateItem[];
}) {
  const [estimate, setEstimate] = useState<MarketplaceEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!items.length || address.trim().length < 6) {
      setEstimate(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/marketplace/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, address, items }),
          signal: controller.signal
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not estimate delivery.");
        setEstimate(payload as MarketplaceEstimate);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setEstimate(null);
        setError(fetchError instanceof Error ? fetchError.message : "Could not estimate delivery.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [address, items, kind]);

  return { estimate, loading, error };
}
