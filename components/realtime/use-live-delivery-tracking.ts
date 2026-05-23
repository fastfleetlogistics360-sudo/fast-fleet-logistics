"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type LiveRiderLocation = {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  updated_at?: string | null;
};

type LiveDeliveryPatch = {
  id?: string;
  rider_id?: string | null;
  status?: string | null;
  eta_minutes?: number | null;
  updated_at?: string | null;
};

type LiveTrackingOptions = {
  deliveryId?: string | null;
  riderId?: string | null;
  onDeliveryChange?: (delivery: LiveDeliveryPatch) => void;
};

export function useLiveDeliveryTracking({ deliveryId, riderId, onDeliveryChange }: LiveTrackingOptions) {
  const [delivery, setDelivery] = useState<LiveDeliveryPatch | null>(null);
  const [riderLocation, setRiderLocation] = useState<LiveRiderLocation | null>(null);
  const onDeliveryChangeRef = useRef(onDeliveryChange);

  useEffect(() => {
    onDeliveryChangeRef.current = onDeliveryChange;
  }, [onDeliveryChange]);

  useEffect(() => {
    if (!deliveryId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`dashboard-delivery:${deliveryId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries", filter: `id=eq.${deliveryId}` },
        (payload) => {
          const next = payload.new as LiveDeliveryPatch;
          setDelivery(next);
          onDeliveryChangeRef.current?.(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deliveryId]);

  useEffect(() => {
    if (!riderId) {
      setRiderLocation(null);
      return;
    }

    let mounted = true;
    const supabase = createClient();

    async function loadInitialLocation() {
      const { data } = await supabase
        .from("rider_locations")
        .select("latitude, longitude, heading, speed, updated_at")
        .eq("rider_profile_id", riderId)
        .maybeSingle();

      if (mounted && data?.latitude && data?.longitude) {
        setRiderLocation({
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          heading: data.heading == null ? null : Number(data.heading),
          speed: data.speed == null ? null : Number(data.speed),
          updated_at: data.updated_at
        });
      }
    }

    const channel = supabase
      .channel(`dashboard-rider-location:${riderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rider_locations", filter: `rider_profile_id=eq.${riderId}` },
        (payload) => {
          const next = payload.new as LiveRiderLocation;
          if (next?.latitude && next?.longitude) {
            setRiderLocation({
              latitude: Number(next.latitude),
              longitude: Number(next.longitude),
              heading: next.heading == null ? null : Number(next.heading),
              speed: next.speed == null ? null : Number(next.speed),
              updated_at: next.updated_at
            });
          }
        }
      )
      .subscribe();

    void loadInitialLocation();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [riderId]);

  return { delivery, riderLocation };
}
