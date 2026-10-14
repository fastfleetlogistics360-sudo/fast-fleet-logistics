"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, CarFront, CheckCircle2, CircleDotDashed, Loader2, Truck } from "lucide-react";
import { accountTrackingHref } from "@/lib/tracking-links";
import { Card } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format";
import { openSecureCheckout } from "@/lib/payments/open-secure-checkout";

type MatchState = {
  deliveryCode: string;
  status: string;
  riderAssigned: boolean;
  vehicleOption: string;
  riderName?: string | null;
  paymentRequired?: boolean;
  paymentExpiresAt?: string | null;
  payableAmount?: number | null;
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
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const redirectStarted = useRef(false);
  const activeVehicle = match.vehicleOption || "motorcycle";
  const paymentRequired = match.paymentRequired === true;
  const assigned = match.riderAssigned || ["accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation", "delivered"].includes(match.status);
  const queued = match.status === "accepted_pending_delivery";
  const unavailable = !match.riderAssigned && ["cancelled", "expired"].includes(match.status);
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
    const onResume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [deliveryId, matchToken]);

  useEffect(() => {
    if (!paymentRequired) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [paymentRequired]);

  useEffect(() => {
    if (!assigned || paymentRequired || !match.messengerHref || redirectStarted.current) return;
    redirectStarted.current = true;
    const timer = window.setTimeout(() => router.replace(match.messengerHref || "/dashboard"), 1200);
    return () => window.clearTimeout(timer);
  }, [assigned, paymentRequired, match.messengerHref, router]);

  const expiryMs = match.paymentExpiresAt ? new Date(match.paymentExpiresAt).getTime() : 0;
  const secondsRemaining = expiryMs ? Math.max(0, Math.ceil((expiryMs - now) / 1_000)) : null;
  const reservationExpired = paymentRequired && secondsRemaining === 0;
  const title = unavailable ? "No rider is currently available" : reservationExpired ? "Payment reservation expired" : paymentRequired ? "Complete payment to proceed" : queued ? "Courier scheduled" : assigned ? "Courier found" : "Finding an available rider";
  const message = reservationExpired
    ? "This rider reservation has expired. Refresh the delivery state to search for another available rider."
    : unavailable
      ? "No rider accepted this request. You can try another delivery request or cancel without any payment being collected."
    : paymentRequired
      ? `Your rider, ${match.riderName || "Your rider"}, has accepted your order. Complete payment to proceed.`
      : assigned
    ? queued
      ? `A verified ${vehicleLabel.toLowerCase()} courier accepted your delivery and will begin after their current trip. Live tracking will update automatically.`
      : `A verified ${vehicleLabel.toLowerCase()} courier accepted your delivery. Live tracking is ready.`
    : `Finding an available rider. We are safely offering this delivery to nearby verified ${vehicleLabel.toLowerCase()} riders.`;

  async function beginPayment() {
    if (checkoutBusy || reservationExpired) return;
    setCheckoutBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/deliveries/start-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId, matchToken })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.authorizationUrl !== "string") throw new Error(payload.error || "Payment checkout could not start.");
      await openSecureCheckout(payload.authorizationUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Payment checkout could not start.");
      setCheckoutBusy(false);
    }
  }

  return (
    <Card className={`grid gap-5 p-6 ${compact ? "" : "text-center"}`}>
      <div className={compact ? "flex items-start gap-4" : "grid justify-items-center gap-3"}>
        <div className={`grid h-14 w-14 place-items-center rounded-full ${assigned ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
          {assigned ? <CheckCircle2 className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
        </div>
        <div>
          <StatusBadge tone={reservationExpired ? "amber" : assigned ? "green" : "blue"}>{reservationExpired ? "Expired" : paymentRequired ? "Payment required" : queued ? "Rider scheduled" : assigned ? "Rider assigned" : "Searching"}</StatusBadge>
          <h1 className="mt-3 text-2xl font-black text-fleet-night">{title}</h1>
          <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-600">{message}</p>
        </div>
      </div>

      {!assigned ? <VehicleSearchRail activeVehicle={activeVehicle} /> : null}
      {paymentRequired ? <div className="rounded-fleet border border-amber-200 bg-amber-50 p-4 text-left"><p className="text-xs font-black uppercase tracking-[0.12em] text-amber-800">Reserved rider · contact stays private until payment</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><strong className="block text-xl font-black text-fleet-night">{formatMoney(Number(match.payableAmount || 0))}</strong><span className="text-xs font-bold text-slate-600">{secondsRemaining === null ? "Payment window is active." : secondsRemaining > 0 ? `Complete payment in ${formatCountdown(secondsRemaining)}.` : "Payment window has expired."}</span></div><Button type="button" onClick={() => void beginPayment()} disabled={checkoutBusy || reservationExpired}>{checkoutBusy ? "Opening secure checkout…" : "Complete payment"}</Button></div></div> : null}
      {error ? <p className="rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{error} We will keep checking automatically.</p> : null}
      <p className="text-xs font-bold text-slate-500">{paymentRequired ? "Payment is verified server-side before delivery controls unlock." : assigned ? "Payment successful! Your rider is ready to proceed." : `Delivery code: ${match.deliveryCode || deliveryCode}`}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        {unavailable ? <LinkButton href="/book">Try again</LinkButton> : null}
        <LinkButton href={accountTrackingHref(match.deliveryCode || deliveryCode)}>Track delivery</LinkButton>
        <LinkButton href="/dashboard" variant="secondary">Customer dashboard</LinkButton>
      </div>
    </Card>
  );
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
