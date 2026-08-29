"use client";

import { useEffect, useState } from "react";
import type { LightVehicleOption } from "@/components/booking/light-vehicle-options";
import type { MarketplaceEstimateItem } from "@/components/marketplace/use-marketplace-estimate";

export type MarketplaceVehicleOption = LightVehicleOption & {
  itemsTotal: number;
  platformFee: number;
  distanceKm: number;
  deliverySpeed: "same_day" | "interstate";
  allowed: boolean;
  policyMessage: string | null;
  interstateDispatch: boolean;
  interstateDeliveryDays: number | null;
  vehicle: "bike";
  vehicleSubtype: "bicycle" | null;
  campus?: { applied?: boolean; lecturerBenefit?: boolean; message?: string | null };
};

export function useMarketplaceVehicleOptions({ kind, address, items }: { kind: "restaurant" | "shopping"; address: string; items: MarketplaceEstimateItem[] }) {
  const [options, setOptions] = useState<MarketplaceVehicleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!items.length || address.trim().length < 6) {
      setOptions([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/marketplace/vehicle-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, address, items }), signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Could not check rider options.");
        setOptions(Array.isArray(payload.options) ? payload.options as MarketplaceVehicleOption[] : []);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setOptions([]);
        setError(fetchError instanceof Error ? fetchError.message : "Could not check rider options.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 500);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [address, items, kind]);

  return { options, loading, error };
}
