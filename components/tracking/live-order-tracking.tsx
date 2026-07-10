"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bike, Clock3, MapPin, MessageCircle, Navigation2, Phone, Route, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney } from "@/lib/format";
import { riderAccountTypeLabel, type RiderAccountType } from "@/lib/rider-account-type";
import { FastFleetMap } from "@/components/maps/fastfleet-map";
import { PackagePickupProof } from "@/components/tracking/package-pickup-proof";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type LatLng = {
  latitude: number;
  longitude: number;
};

export type DeliveryLocation = LatLng & {
  id?: string;
  order_id?: string;
  rider_id?: string;
  heading?: number | null;
  speed?: number | null;
  status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type TrackingOrder = {
  id: string;
  delivery_code: string;
  pickup_address: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  dropoff_address: string;
  dropoff_latitude?: number | null;
  dropoff_longitude?: number | null;
  status: string;
  price_ngn: number;
  distance_km?: number | null;
  eta_minutes?: number | null;
  created_at: string;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
  rider_id?: string | null;
  rider?: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    avatar_url?: string | null;
    vehicle_type?: string | null;
    plate_number?: string | null;
    vehicle_color?: string | null;
    rider_account_type?: RiderAccountType | null;
  } | null;
};

const statusSteps = [
  { keys: ["accepted"], label: "Rider assigned" },
  { keys: ["accepted", "rider_arrived"], label: "Heading to pickup" },
  { keys: ["picked_up"], label: "Picked up" },
  { keys: ["in_transit"], label: "On the way" },
  { keys: ["rider_arrived", "delivered"], label: "Arrived" },
  { keys: ["delivered"], label: "Delivered" }
];

export function LiveOrderTracking({
  initialOrder,
  initialLocation
}: {
  initialOrder: TrackingOrder;
  initialLocation: DeliveryLocation | null;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [location, setLocation] = useState<DeliveryLocation | null>(initialLocation);
  const [connectionState, setConnectionState] = useState<"loading" | "live" | "offline" | "complete">(
    isComplete(initialOrder.status) ? "complete" : initialLocation ? "live" : "loading"
  );
  const orderStatusRef = useRef(initialOrder.status);
  const hasLocationRef = useRef(Boolean(initialLocation));

  useEffect(() => {
    orderStatusRef.current = order.status;
  }, [order.status]);

  useEffect(() => {
    hasLocationRef.current = Boolean(location);
  }, [location]);

  useEffect(() => {
    const supabase = createClient();
    const locationChannel = supabase
      .channel(`customer-delivery-location:${initialOrder.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_locations", filter: `order_id=eq.${initialOrder.id}` },
        (payload) => {
          const next = payload.new as DeliveryLocation;
          if (next?.latitude && next?.longitude) {
            setLocation({
              ...next,
              latitude: Number(next.latitude),
              longitude: Number(next.longitude),
              heading: next.heading == null ? null : Number(next.heading),
              speed: next.speed == null ? null : Number(next.speed)
            });
            setConnectionState(isComplete(next.status || orderStatusRef.current) ? "complete" : "live");
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && !isComplete(orderStatusRef.current)) setConnectionState(hasLocationRef.current ? "live" : "loading");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnectionState(isComplete(orderStatusRef.current) ? "complete" : "offline");
      });

    const orderChannel = supabase
      .channel(`customer-delivery-status:${initialOrder.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries", filter: `id=eq.${initialOrder.id}` },
        (payload) => {
          const next = payload.new as Partial<TrackingOrder>;
          setOrder((current) => ({ ...current, ...next }));
          if (isComplete(String(next.status || orderStatusRef.current))) setConnectionState("complete");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(locationChannel);
      supabase.removeChannel(orderChannel);
    };
  }, [initialOrder.id]);

  useEffect(() => {
    if (isComplete(order.status)) setConnectionState("complete");
  }, [order.status]);

  useEffect(() => {
    if (!order.rider_id || order.rider?.full_name) return;
    const supabase = createClient();
    let mounted = true;
    async function loadRiderDetails() {
      const trackingResponse = await fetch(`/api/tracking?code=${encodeURIComponent(order.delivery_code)}`, { cache: "no-store" }).catch(() => null);
      if (trackingResponse?.ok) {
        const payload = (await trackingResponse.json().catch(() => ({}))) as { delivery?: { rider?: TrackingOrder["rider"] } };
        if (mounted && payload.delivery?.rider?.full_name) {
          setOrder((current) => ({ ...current, rider: payload.delivery?.rider || current.rider }));
          return;
        }
      }
      const { data } = await supabase
        .from("rider_profiles")
        .select("plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, email, avatar_url)")
        .eq("id", order.rider_id)
        .maybeSingle<{
          plate_number?: string | null;
          vehicle_type?: string | null;
          vehicle_color?: string | null;
          rider_account_type?: RiderAccountType | null;
          users?: { full_name?: string | null; phone?: string | null; email?: string | null; avatar_url?: string | null } | null;
        }>();
      if (!mounted || !data) return;
      setOrder((current) => ({
        ...current,
        rider: {
          full_name: data.users?.full_name || null,
          phone: data.users?.phone || null,
          email: data.users?.email || null,
          avatar_url: data.users?.avatar_url || null,
          vehicle_type: data.vehicle_type || null,
          plate_number: data.plate_number || null,
          vehicle_color: data.vehicle_color || null,
          rider_account_type: data.rider_account_type || null
        }
      }));
    }
    void loadRiderDetails();
    return () => {
      mounted = false;
    };
  }, [order.delivery_code, order.rider?.full_name, order.rider_id]);

  const pickup = toPoint(order.pickup_latitude, order.pickup_longitude);
  const dropoff = toPoint(order.dropoff_latitude, order.dropoff_longitude);
  const remainingKm = useMemo(() => {
    if (location && dropoff) return haversineKm(location, dropoff);
    return Number(order.distance_km || 0);
  }, [dropoff, location, order.distance_km]);
  const etaMinutes = useMemo(() => {
    if (location?.speed && location.speed > 1 && dropoff) return Math.max(1, Math.round((remainingKm / (location.speed * 3.6)) * 60));
    return Number(order.eta_minutes || 0);
  }, [dropoff, location?.speed, order.eta_minutes, remainingKm]);
  const stale = location?.updated_at ? Date.now() - new Date(location.updated_at).getTime() > 30000 : !location;
  const riderName = order.rider?.full_name || "Rider pending";
  const riderTag = order.rider_id ? riderAccountTypeLabel(order.rider?.rider_account_type) : "Rider tag pending";
  const completed = isComplete(order.status);

  return (
    <section className="min-h-screen bg-fleet-paper">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:py-8">
        <main className="grid min-w-0 gap-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <Link href="/dashboard" className="text-sm font-black text-fleet-ember">Back to dashboard</Link>
              <h1 className="mt-2 text-3xl font-black text-fleet-night sm:text-5xl">{order.delivery_code}</h1>
              <p className="mt-2 text-sm font-semibold text-slate-600">Live delivery tracking from pickup to drop-off.</p>
            </div>
            <StatusBadge tone={completed ? "green" : stale ? "amber" : "blue"}>{connectionLabel(connectionState, stale)}</StatusBadge>
          </div>

          <Card className="overflow-hidden p-0">
            <LiveTrackingMap order={order} pickup={pickup} dropoff={dropoff} location={location} />
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard icon={Clock3} label="ETA" value={completed ? "Delivered" : etaMinutes ? `${etaMinutes} min` : "Calculating"} />
            <MetricCard icon={Route} label="Remaining" value={completed ? "0 km" : remainingKm ? `${remainingKm.toFixed(1)} km` : "Waiting"} />
            <MetricCard icon={Navigation2} label="Status" value={statusLabel(order.status)} />
          </div>

          <Card className="p-4 sm:p-5">
            <h2 className="text-xl font-black text-fleet-night">Delivery progress</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {statusSteps.map((step) => {
                const active = step.keys.includes(order.status) || isStepDone(step.label, order.status);
                return (
                  <div key={step.label} className={cn("rounded-fleet border p-3", active ? "border-fleet-leaf bg-emerald-50 text-emerald-800" : "border-fleet-line bg-white text-slate-500")}>
                    <span className="block text-xs font-black uppercase leading-5">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <PackagePickupProof deliveryId={order.id} metadata={order.metadata} status={order.status} />
        </main>

        <aside className="grid content-start gap-5">
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-fleet bg-fleet-navy text-white">
                <Bike className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Rider</p>
                <h2 className="mt-1 text-xl font-black text-fleet-night">{riderName}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {order.rider?.vehicle_color || "Vehicle"} {order.rider?.vehicle_type || "bike"} · {order.rider?.plate_number || "Plate pending"}
                </p>
                <span className="mt-2 inline-flex rounded-fleet bg-fleet-paper px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-fleet-night">
                  {riderTag}
                </span>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              <LinkButton href={`tel:${order.rider?.phone || ""}`} className="w-full" variant={order.rider?.phone ? "primary" : "secondary"}>
                <Phone className="h-4 w-4" />
                Call rider
              </LinkButton>
              <LinkButton href={`/support?topic=delivery-message&delivery=${order.delivery_code}`} variant="secondary" className="w-full">
                <MessageCircle className="h-4 w-4" />
                Message support
              </LinkButton>
              <LinkButton href={`/support?topic=delivery-issue&delivery=${order.delivery_code}`} variant="destructive" className="w-full">
                <AlertTriangle className="h-4 w-4" />
                Report issue
              </LinkButton>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-xl font-black text-fleet-night">Route details</h2>
            <div className="mt-4 grid gap-3">
              <InfoRow icon={MapPin} label="Pickup" value={order.pickup_address} />
              <InfoRow icon={MapPin} label="Drop-off" value={order.dropoff_address} />
              <InfoRow icon={ShieldCheck} label="Fee" value={formatMoney(order.price_ngn)} />
              <InfoRow icon={Clock3} label="Created" value={formatDateTime(order.created_at)} />
            </div>
          </Card>

          <TrackingStateCard state={connectionState} stale={stale} completed={completed} location={location} />
        </aside>
      </div>
    </section>
  );
}

function LiveTrackingMap({
  order,
  pickup,
  dropoff,
  location
}: {
  order: TrackingOrder;
  pickup: LatLng | null;
  dropoff: LatLng | null;
  location: DeliveryLocation | null;
}) {
  const displayLocation = useSmoothLocation(location);
  const updatedAt = location?.updated_at || null;
  return (
    <FastFleetMap
      className="min-h-[62dvh] rounded-none border-0"
      label="Live route"
      title={statusLabel(order.status)}
      subtitle={`${order.pickup_address} to ${order.dropoff_address}`}
      badge={updatedAt ? `Updated ${relativeUpdateLabel(updatedAt)}` : "Waiting for rider"}
      status={order.status}
      pickup={pickup}
      dropoff={dropoff}
      rider={displayLocation || location}
      pickupAddress={order.pickup_address}
      dropoffAddress={order.dropoff_address}
      riderName={order.rider?.full_name || "Rider"}
      riderAvatarUrl={order.rider?.avatar_url}
      customerName="Customer"
    />
  );
}

function TrackingStateCard({ state, stale, completed, location }: { state: string; stale: boolean; completed: boolean; location: DeliveryLocation | null }) {
  const title = completed ? "Delivery completed" : !location ? "No rider location yet" : stale ? "Rider may be offline" : state === "loading" ? "Connecting to rider" : "Rider is live";
  const body = completed
    ? "This delivery is closed. The last known route position remains available for support."
    : !location
      ? "The map will update once the rider starts delivery tracking from the rider app."
      : stale
        ? "Showing the last known rider position while realtime reconnects."
        : "Location updates are streaming to this order in realtime.";
  return (
    <Card className="p-5">
      <h2 className="text-lg font-black text-fleet-night">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
    </Card>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-fleet bg-fleet-paper p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fleet-ember" />
      <span className="min-w-0">
        <span className="block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
        <strong className="mt-1 block break-words text-sm font-black text-fleet-night">{value}</strong>
      </span>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card className="p-4">
      <Icon className="h-5 w-5 text-fleet-ember" />
      <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <strong className="mt-1 block text-xl font-black text-fleet-night">{value}</strong>
    </Card>
  );
}

function useSmoothLocation(location: DeliveryLocation | null) {
  const [display, setDisplay] = useState<DeliveryLocation | null>(location);

  useEffect(() => {
    if (!location) return;
    if (!display) {
      setDisplay(location);
      return;
    }

    const start = performance.now();
    const from = display;
    const target = location;
    let frame = 0;
    function animate(now: number) {
      const progress = Math.min(1, (now - start) / 900);
      setDisplay({
        ...target,
        latitude: from.latitude + (target.latitude - from.latitude) * progress,
        longitude: from.longitude + (target.longitude - from.longitude) * progress
      });
      if (progress < 1) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [location?.latitude, location?.longitude]);

  return display;
}

function toPoint(latitude?: number | null, longitude?: number | null): LatLng | null {
  if (latitude == null || longitude == null) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

function haversineKm(from: LatLng, to: LatLng) {
  const earthKm = 6371;
  const dLat = degreesToRadians(to.latitude - from.latitude);
  const dLng = degreesToRadians(to.longitude - from.longitude);
  const lat1 = degreesToRadians(from.latitude);
  const lat2 = degreesToRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function isComplete(status: string) {
  return status === "delivered" || status === "cancelled";
}

function statusLabel(status: string) {
  if (status === "pending_payment") return "Awaiting payment";
  if (status === "searching") return "Finding rider";
  if (status === "accepted") return "Rider assigned";
  if (status === "rider_arrived") return "Rider at pickup";
  if (status === "picked_up") return "Package picked up";
  if (status === "in_transit") return "On the way";
  if (status === "delivered") return "Delivered";
  if (status === "cancelled") return "Cancelled";
  return status.replaceAll("_", " ");
}

function isStepDone(label: string, status: string) {
  const order = ["Rider assigned", "Heading to pickup", "Picked up", "On the way", "Arrived", "Delivered"];
  const statusIndex =
    status === "delivered" ? 5 : status === "in_transit" ? 3 : status === "picked_up" ? 2 : status === "rider_arrived" ? 1 : status === "accepted" ? 0 : -1;
  return order.indexOf(label) <= statusIndex;
}

function connectionLabel(state: string, stale: boolean) {
  if (state === "complete") return "Complete";
  if (stale) return "Last known";
  if (state === "live") return "Live";
  if (state === "offline") return "Offline";
  return "Connecting";
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
