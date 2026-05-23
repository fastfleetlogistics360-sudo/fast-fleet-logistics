"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bike, CheckCircle2, Clock3, MapPinned, PackageCheck, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RoutePreview } from "@/components/maps/route-preview";
import { StatusBadge } from "@/components/ui/status-badge";

const statusFlow = [
  ["received", "Order received"],
  ["assigned", "Courier assigned"],
  ["picked_up", "Picked up"],
  ["in_transit", "In transit"],
  ["delivered", "Delivered"]
];

type TrackedDelivery = {
  id?: string;
  delivery_code: string;
  rider_id?: string | null;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  vehicle_type: string;
  delivery_speed: string;
  price_ngn: number;
  eta_minutes: number;
  rider?: { full_name?: string; phone?: string };
};

const sample: TrackedDelivery = {
  delivery_code: "FF-DEMO-1001",
  pickup_address: "Victoria Island, Lagos",
  dropoff_address: "Ikeja GRA, Lagos",
  status: "in_transit",
  vehicle_type: "bike",
  delivery_speed: "express",
  price_ngn: 10850,
  eta_minutes: 22,
  rider: { full_name: "Tunde Adebayo", phone: "+234 801 220 4410" }
};

export function TrackingConsole() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") || "FF-DEMO-1001");
  const [delivery, setDelivery] = useState<TrackedDelivery | null>(sample);
  const [lastLocation, setLastLocation] = useState<string>("Live rider heartbeat ready");
  const [loading, setLoading] = useState(false);
  const currentIndex = useMemo(() => timelineIndex(delivery?.status), [delivery?.status]);

  async function loadDelivery(nextCode = code) {
    setLoading(true);
    try {
      const supabase = createClient();
      const result = await supabase
        .from("deliveries")
        .select("id, rider_id, delivery_code, pickup_address, dropoff_address, status, vehicle_type, delivery_speed, price_ngn, eta_minutes")
        .eq("delivery_code", nextCode.trim().toUpperCase())
        .maybeSingle();

      setDelivery(result.data || sample);
      if (result.data?.rider_id) await loadLastRiderLocation(result.data.rider_id);
    } catch {
      const local = JSON.parse(localStorage.getItem("fastfleet.next.deliveries") || "[]").find(
        (item: { delivery_code?: string }) => item.delivery_code?.toUpperCase() === nextCode.trim().toUpperCase()
      );
      setDelivery(
        local
          ? {
              delivery_code: local.delivery_code,
              pickup_address: local.pickup_address || local.pickup,
              dropoff_address: local.dropoff_address || local.dropoff,
              status: local.status,
              vehicle_type: local.vehicle_type || local.vehicle || "bike",
              delivery_speed: local.delivery_speed || local.speed || "same_day",
              price_ngn: local.price_ngn || local.estimate?.total || 0,
              eta_minutes: local.eta_minutes || local.estimate?.etaMinutes || 35
            }
          : sample
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDelivery(searchParams.get("code") || code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!delivery?.delivery_code) return;
    let cleanup: (() => void) | undefined;

    try {
      const supabase = createClient();
      const channel = supabase
        .channel(`track:${delivery.delivery_code}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "deliveries", filter: `delivery_code=eq.${delivery.delivery_code}` },
          (payload) => setDelivery((payload.new as TrackedDelivery) || sample)
        )
        .subscribe();

      cleanup = () => {
        supabase.removeChannel(channel);
      };
    } catch {
      cleanup = undefined;
    }

    return () => cleanup?.();
  }, [delivery?.delivery_code]);

  useEffect(() => {
    if (!delivery?.rider_id) return;
    let cleanup: (() => void) | undefined;

    try {
      const supabase = createClient();
      const channel = supabase
        .channel(`rider-location:${delivery.rider_id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rider_locations", filter: `rider_profile_id=eq.${delivery.rider_id}` },
          (payload) => {
            const next = payload.new as { latitude?: number; longitude?: number; updated_at?: string };
            setLastLocation(
              next.latitude && next.longitude
                ? `${Number(next.latitude).toFixed(5)}, ${Number(next.longitude).toFixed(5)}`
                : "Rider location updated"
            );
          }
        )
        .subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    } catch {
      cleanup = undefined;
    }

    return () => cleanup?.();
  }, [delivery?.rider_id]);

  async function loadLastRiderLocation(riderId: string) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("rider_locations")
        .select("latitude, longitude, updated_at")
        .eq("rider_profile_id", riderId)
        .maybeSingle();
      if (data?.latitude && data?.longitude) {
        setLastLocation(`${Number(data.latitude).toFixed(5)}, ${Number(data.longitude).toFixed(5)}`);
      }
    } catch {
      // Realtime subscription will fill this once a rider shares location.
    }
  }

  return (
    <section className="section-wrap grid gap-6 py-8 lg:grid-cols-[0.95fr_1.05fr] lg:py-12">
      <div className="grid gap-5">
        <Card className="p-4 sm:p-5">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Track delivery</span>
          <h1 className="mt-2 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Live status and ETA.</h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input className="form-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="FF-000000-00" />
            <Button type="button" onClick={() => loadDelivery()} disabled={loading}>
              <Search className="h-4 w-4" />
              Track
            </Button>
          </div>
        </Card>

        <RoutePreview
          label="Realtime rider route"
          status={delivery?.status}
          riderName={delivery?.rider?.full_name || "Verified rider en route"}
          pickupAddress={delivery?.pickup_address || sample.pickup_address}
          dropoffAddress={delivery?.dropoff_address || sample.dropoff_address}
        />
      </div>

      <div className="grid gap-5">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Tracking code</span>
              <h2 className="mt-1 text-3xl font-black text-fleet-night">{delivery?.delivery_code}</h2>
            </div>
            <StatusBadge tone={delivery?.status === "delivered" ? "green" : "amber"}>
              {delivery?.status.replaceAll("_", " ")}
            </StatusBadge>
          </div>
          <div className="mt-5 grid gap-3">
            <InfoRow icon={MapPinned} label="Pickup" value={delivery?.pickup_address || ""} />
            <InfoRow icon={PackageCheck} label="Drop-off" value={delivery?.dropoff_address || ""} />
            <InfoRow icon={Bike} label="Rider" value={delivery?.rider?.full_name || "Nearest verified rider"} />
            <InfoRow icon={Clock3} label="ETA" value={`${delivery?.eta_minutes || 22} minutes`} />
            <InfoRow icon={MapPinned} label="Live movement" value={lastLocation} />
          </div>
          <div className="mt-5 flex items-center justify-between rounded-fleet bg-fleet-paper p-4">
            <span className="text-sm font-black text-slate-500">Delivery fee</span>
            <strong className="text-2xl font-black text-fleet-night">{formatMoney(delivery?.price_ngn || 0)}</strong>
          </div>
        </Card>

        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Timeline</span>
          <div className="mt-5 grid grid-cols-5 gap-0">
            {statusFlow.map(([status, label], index) => {
              const done = index < currentIndex;
              const active = index === currentIndex;
              return (
                <div key={status} className="grid min-w-0 grid-rows-[32px_auto] text-center">
                  <div className="relative grid place-items-center">
                    {index !== statusFlow.length - 1 ? (
                      <span className={`absolute left-1/2 right-[-50%] top-1/2 h-1 -translate-y-1/2 rounded-full ${done ? "bg-fleet-leaf" : "bg-fleet-line"}`} />
                    ) : null}
                    <span className={`relative z-10 grid h-5 w-5 place-items-center rounded-full border-2 ${done || active ? "border-fleet-leaf bg-fleet-leaf text-white" : "border-slate-300 bg-white text-slate-400"}`}>
                      {done ? <CheckCircle2 className="h-3 w-3" /> : null}
                    </span>
                  </div>
                  <div className="min-w-0 px-1 pb-2">
                    <strong className="block text-[0.68rem] font-black leading-tight text-fleet-night sm:text-xs">{label}</strong>
                    <span className="text-xs font-semibold text-slate-500">
                      {done || active ? "Updated" : "Waiting"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </section>
  );
}

function timelineIndex(status?: string) {
  if (!status || status === "draft" || status === "quoted" || status === "pending_payment" || status === "searching") return 0;
  if (status === "accepted" || status === "rider_arrived") return 1;
  if (status === "picked_up") return 2;
  if (status === "in_transit") return 3;
  if (status === "delivered") return 4;
  return 0;
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-fleet bg-fleet-paper p-3">
      <Icon className="mt-1 h-4 w-4 shrink-0 text-fleet-ember" />
      <div>
        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
        <strong className="block text-sm font-black text-fleet-night">{value}</strong>
      </div>
    </div>
  );
}
