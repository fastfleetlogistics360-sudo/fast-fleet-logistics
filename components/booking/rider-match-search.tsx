"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, CarFront, CheckCircle2, CircleDotDashed, Loader2, Truck } from "lucide-react";
import { accountTrackingHref } from "@/lib/tracking-links";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

type MatchState = {
  deliveryCode: string;
  status: string;
  riderAssigned: boolean;
  vehicleOption: string;
  messengerHref?: string;
};

const vehicles = [
  { id: "bicycle", label: "Bicycle", Icon: Bike },
  { id: "motorcycle", label: "Bike", Icon: Bike },
  { id: "car", label: "Car", Icon: CarFront },
  { id: "van", label: "Van", Icon: Truck }
];

export function RiderMatchSearch({ deliveryId, deliveryCode, matchToken = null, compact = false }: { deliveryId: string; deliveryCode: string; matchToken?: string | null; compact?: boolean }) {
  const router = useRouter();
  const [match, setMatch] = useState<MatchState>({ deliveryCode, status: "searching", riderAssigned: false, vehicleOption: "" });
  const [error, setError] = useState<string | null>(null);
  const redirectStarted = useRef(false);
  const activeVehicle = match.vehicleOption || "motorcycle";
  const assigned = match.riderAssigned || ["accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation", "delivered"].includes(match.status);
  const queued = match.status === "accepted_pending_delivery";
  const vehicleLabel = vehicles.find((vehicle) => vehicle.id === activeVehicle)?.label || "courier";

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function refresh() {
      try {
        const params = new URLSearchParams({ deliveryId });
        if (matchToken) params.set("matchToken", matchToken);
        const response = await fetch(`/api/deliveries/match-status?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Could not check rider matching status.");
        if (!cancelled) {
          setMatch(payload as MatchState);
          setError(null);
          if (!payload.riderAssigned && payload.status === "searching") timer = window.setTimeout(refresh, 4000);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Connection lost while looking for a rider.");
          timer = window.setTimeout(refresh, 7000);
        }
      }
    }
    refresh();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [deliveryId, matchToken]);

  useEffect(() => {
    if (!assigned || !match.messengerHref || redirectStarted.current) return;
    redirectStarted.current = true;
    const timer = window.setTimeout(() => router.replace(match.messengerHref || "/dashboard"), 1200);
    return () => window.clearTimeout(timer);
  }, [assigned, match.messengerHref, router]);

  const title = queued ? "Courier scheduled" : assigned ? "Courier found" : "Searching for a nearby courier";
  const message = assigned
    ? queued
      ? `A verified ${vehicleLabel.toLowerCase()} courier accepted your delivery and will begin after their current trip. Live tracking will update automatically.`
      : `A verified ${vehicleLabel.toLowerCase()} courier accepted your delivery. Live tracking is ready.`
    : `We are safely offering this delivery to nearby verified ${vehicleLabel.toLowerCase()} riders. You will be updated as soon as one accepts.`;

  return (
    <Card className={`grid gap-5 p-6 ${compact ? "" : "text-center"}`}>
      <div className={compact ? "flex items-start gap-4" : "grid justify-items-center gap-3"}>
        <div className={`grid h-14 w-14 place-items-center rounded-full ${assigned ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
          {assigned ? <CheckCircle2 className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
        </div>
        <div>
          <StatusBadge tone={assigned ? "green" : "blue"}>{queued ? "Rider scheduled" : assigned ? "Rider assigned" : "Searching"}</StatusBadge>
          <h1 className="mt-3 text-2xl font-black text-fleet-night">{title}</h1>
          <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-600">{message}</p>
        </div>
      </div>

      {!assigned ? <VehicleSearchRail activeVehicle={activeVehicle} /> : null}
      {error ? <p className="rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{error} We will keep checking automatically.</p> : null}
      <p className="text-xs font-bold text-slate-500">{assigned ? "Opening your live delivery room…" : `Delivery code: ${match.deliveryCode || deliveryCode}`}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <LinkButton href={accountTrackingHref(match.deliveryCode || deliveryCode)}>Track delivery</LinkButton>
        <LinkButton href="/dashboard" variant="secondary">Customer dashboard</LinkButton>
      </div>
    </Card>
  );
}

function VehicleSearchRail({ activeVehicle }: { activeVehicle: string }) {
  const [sweepIndex, setSweepIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setSweepIndex((current) => (current + 1) % vehicles.length), 720);
    return () => window.clearInterval(timer);
  }, []);
  const sweepingVehicle = vehicles[sweepIndex];
  const progressWidth = `${((sweepIndex + 1) / vehicles.length) * 100}%`;
  return (
    <div className="rounded-fleet border border-sky-100 bg-sky-50/60 p-4 text-left">
      <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] text-sky-800">
        <span>Searching nearby riders</span>
        <span className="inline-flex items-center gap-1"><CircleDotDashed className="h-3.5 w-3.5 animate-spin" /> {sweepingVehicle.label}</span>
      </div>
      <div className="relative mt-5 h-2 rounded-full bg-sky-100">
        <span className="absolute inset-y-0 left-0 rounded-full bg-fleet-ember transition-all duration-700" style={{ width: progressWidth }} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {vehicles.map(({ id, label, Icon }) => {
          const selected = id === activeVehicle;
          const sweeping = id === sweepingVehicle.id;
          return (
            <div key={id} className={`grid justify-items-center gap-1 text-center text-[10px] font-black uppercase tracking-wide ${sweeping ? "text-fleet-ember" : selected ? "text-sky-800" : "text-slate-400"}`}>
              <span className={`grid h-8 w-8 place-items-center rounded-full transition-all duration-300 ${sweeping ? "-translate-y-1 scale-110 bg-orange-100 shadow-sm" : selected ? "bg-sky-100 ring-2 ring-sky-300" : "bg-white"}`}><Icon className="h-4 w-4" /></span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
