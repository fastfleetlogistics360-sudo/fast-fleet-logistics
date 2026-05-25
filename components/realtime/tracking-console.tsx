"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bike, CheckCircle2, Clock3, MapPinned, PackageCheck, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  rider?: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    vehicle_type?: string | null;
    plate_number?: string | null;
    vehicle_color?: string | null;
  };
  last_location?: { latitude: number; longitude: number; updated_at?: string | null } | null;
};

export function TrackingConsole() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code")?.trim().toUpperCase() || "";
  const [code, setCode] = useState(initialCode);
  const [delivery, setDelivery] = useState<TrackedDelivery | null>(null);
  const [message, setMessage] = useState(initialCode ? "" : "Enter your tracking code to view an active delivery.");
  const [loading, setLoading] = useState(false);
  const currentIndex = useMemo(() => timelineIndex(delivery?.status), [delivery?.status]);
  const locationLabel = useMemo(() => formatLocation(delivery?.last_location), [delivery?.last_location]);

  async function loadDelivery(nextCode = code) {
    const trackingCode = nextCode.trim().toUpperCase();
    if (!trackingCode) {
      setDelivery(null);
      setMessage("Enter your tracking code to view an active delivery.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tracking?code=${encodeURIComponent(trackingCode)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { delivery?: TrackedDelivery; error?: string };
      if (!response.ok || !payload.delivery) {
        setDelivery(null);
        setMessage(payload.error || "No ongoing delivery was found for that tracking code.");
        return;
      }
      setDelivery(payload.delivery);
      setCode(payload.delivery.delivery_code);
    } catch {
      setDelivery(null);
      setMessage("Tracking is temporarily unavailable. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialCode) loadDelivery(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!delivery?.delivery_code || delivery.status === "delivered") return;
    const timer = window.setInterval(() => loadDelivery(delivery.delivery_code), 30000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery?.delivery_code, delivery?.status]);

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
              {loading ? "Checking" : "Track"}
            </Button>
          </div>
          {message ? <p className="mt-3 text-sm font-bold text-slate-600">{message}</p> : null}
        </Card>

        {delivery ? (
          <RoutePreview
            label="Active delivery route"
            status={delivery.status}
            riderName={delivery.rider?.full_name || "Verified rider assigned"}
            pickupAddress={delivery.pickup_address}
            dropoffAddress={delivery.dropoff_address}
            riderLocation={delivery.last_location}
          />
        ) : (
          <Card className="grid min-h-[360px] place-items-center p-6 text-center">
            <div>
              <MapPinned className="mx-auto h-10 w-10 text-fleet-ember" />
              <h2 className="mt-4 text-2xl font-black text-fleet-night">No delivery loaded.</h2>
              <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-600">
                Tracking details appear here after a valid ongoing delivery code is entered.
              </p>
            </div>
          </Card>
        )}
      </div>

      <div className="grid gap-5">
        {delivery ? <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Tracking code</span>
              <h2 className="mt-1 text-3xl font-black text-fleet-night">{delivery.delivery_code}</h2>
            </div>
            <StatusBadge tone={delivery.status === "delivered" ? "green" : "amber"}>
              {delivery.status.replaceAll("_", " ")}
            </StatusBadge>
          </div>
          <div className="mt-5 grid gap-3">
            <InfoRow icon={MapPinned} label="Pickup" value={delivery.pickup_address} />
            <InfoRow icon={PackageCheck} label="Drop-off" value={delivery.dropoff_address} />
	            <InfoRow icon={Bike} label="Rider" value={riderLabel(delivery)} />
	            <InfoRow icon={Bike} label="Vehicle" value={`${delivery.rider?.vehicle_color || "Vehicle"} ${delivery.rider?.vehicle_type || delivery.vehicle_type} · ${delivery.rider?.plate_number || "Plate pending"}`} />
            <InfoRow icon={Clock3} label="ETA" value={delivery.eta_minutes ? `${delivery.eta_minutes} minutes` : "Updating"} />
            <InfoRow icon={MapPinned} label="Live movement" value={locationLabel || "Waiting for rider heartbeat"} />
          </div>
          <div className="mt-5 flex items-center justify-between rounded-fleet bg-fleet-paper p-4">
            <span className="text-sm font-black text-slate-500">Delivery fee</span>
            <strong className="text-2xl font-black text-fleet-night">{formatMoney(delivery.price_ngn || 0)}</strong>
          </div>
        </Card> : null}

        {delivery ? <Card className="p-5">
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
        </Card> : null}
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

function formatLocation(location?: TrackedDelivery["last_location"]) {
  if (!location?.latitude || !location.longitude) return "";
  const updated = location.updated_at ? ` · ${relativeUpdateLabel(location.updated_at)}` : "";
  return `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}${updated}`;
}

function riderLabel(delivery: TrackedDelivery) {
  const name = delivery.rider?.full_name || "Verified rider assigned";
  const phone = delivery.rider?.phone ? ` · ${delivery.rider.phone}` : "";
  return `${name}${phone}`;
}

function relativeUpdateLabel(value: string) {
  const updatedAt = new Date(value).getTime();
  if (!Number.isFinite(updatedAt)) return "recently";
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return "recently";
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
