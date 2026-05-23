import { Bike, Building2, Home, MapPin, Navigation2, PackageCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LiveRiderLocation } from "@/components/realtime/use-live-delivery-tracking";

const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export function RoutePreview({
  compact = false,
  className,
  label = "Lagos live route",
  status,
  riderName = "Verified rider",
  pickupAddress = "Victoria Island, Lagos",
  dropoffAddress = "Ikeja GRA, Lagos",
  riderLocation
}: {
  compact?: boolean;
  className?: string;
  label?: string;
  status?: string;
  riderName?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  riderLocation?: LiveRiderLocation | null;
}) {
  const progress = statusProgress(status);
  const mapUrl = googleMapsKey ? googleDirectionsUrl(pickupAddress, dropoffAddress) : null;
  const locationLabel = riderLocation ? `${riderLocation.latitude.toFixed(5)}, ${riderLocation.longitude.toFixed(5)}` : null;
  const updatedLabel = riderLocation?.updated_at ? relativeUpdateLabel(riderLocation.updated_at) : null;

  if (mapUrl) {
    return (
      <div className={cn("relative overflow-hidden rounded-fleet border border-fleet-line bg-slate-100", compact ? "min-h-[220px]" : "min-h-[360px]", className)}>
        <iframe
          title={`${label} Google Map`}
          src={mapUrl}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-fleet border border-white/80 bg-white/92 p-4 shadow-lift backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">{label}</span>
              <strong className="mt-1 block truncate text-lg font-black text-fleet-night">{riderName}</strong>
              {locationLabel ? <span className="mt-1 block text-xs font-bold text-slate-500">Live driver: {locationLabel}{updatedLabel ? ` · ${updatedLabel}` : ""}</span> : null}
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              <Navigation2 className="h-3.5 w-3.5" />
              {movementLabel(status)}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-fleet-paper">
            <div className="h-full rounded-full bg-gradient-to-r from-fleet-leaf via-fleet-gold to-fleet-ember transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black text-slate-600">
            <span className="truncate rounded-fleet bg-fleet-paper px-2 py-2">
              <MapPin className="mr-1 inline h-3.5 w-3.5 text-fleet-leaf" />
              {pickupAddress}
            </span>
            <span className="truncate rounded-fleet bg-fleet-paper px-2 py-2">
              <PackageCheck className="mr-1 inline h-3.5 w-3.5 text-fleet-blue" />
              {dropoffAddress}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("map-grid relative overflow-hidden rounded-fleet border border-fleet-line", compact ? "min-h-[220px]" : "min-h-[360px]", className)}>
      <div className="absolute left-[11%] top-[18%] grid h-12 w-12 place-items-center rounded-fleet bg-white text-fleet-leaf shadow-lift">
        <Home className="h-5 w-5" />
      </div>
      <div className="absolute right-[10%] top-[23%] grid h-12 w-12 place-items-center rounded-fleet bg-white text-fleet-ember shadow-lift">
        <Building2 className="h-5 w-5" />
      </div>
      <div className="absolute inset-x-[14%] top-[34%] h-[44%] rounded-[48%] border-t-[6px] border-r-[6px] border-fleet-ember/90" />
      <div className="absolute left-[32%] top-[46%] h-3 w-3 animate-pulseSoft rounded-full bg-fleet-ember shadow-[0_0_0_8px_rgba(239,108,0,0.15)]" />
      <div className="absolute left-[47%] top-[49%] h-3 w-3 animate-pulseSoft rounded-full bg-fleet-leaf shadow-[0_0_0_8px_rgba(21,163,107,0.15)]" />
      <div className="absolute left-[17%] right-[12%] top-[55%] h-2 rounded-full bg-white/80 shadow-[0_8px_24px_rgba(8,17,31,0.08)]">
        <div className="h-2 rounded-full bg-gradient-to-r from-fleet-leaf via-fleet-gold to-fleet-ember transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>
      <div className="absolute top-[50%] grid h-12 w-12 -translate-x-1/2 place-items-center rounded-full bg-fleet-night text-white shadow-lift transition-all duration-700" style={{ left: `${17 + progress * 0.71}%` }}>
        <Bike className="h-5 w-5" />
        <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulseSoft rounded-full bg-fleet-gold shadow-[0_0_0_7px_rgba(244,166,42,0.18)]" />
      </div>
      <div className="absolute bottom-4 left-4 right-4 rounded-fleet border border-white/70 bg-white/92 p-4 shadow-lift backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">{label}</span>
            <strong className="mt-1 block text-lg font-black text-fleet-night">{riderName}</strong>
            {locationLabel ? <span className="mt-1 block text-xs font-bold text-slate-500">Live driver: {locationLabel}{updatedLabel ? ` · ${updatedLabel}` : ""}</span> : null}
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
            <Navigation2 className="h-3.5 w-3.5" />
            {movementLabel(status)}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-black text-slate-600">
          <span className="rounded-fleet bg-fleet-paper px-2 py-2">
            <MapPin className="mr-1 inline h-3.5 w-3.5 text-fleet-leaf" />
            Pickup
          </span>
          <span className="rounded-fleet bg-fleet-paper px-2 py-2">
            <Bike className="mr-1 inline h-3.5 w-3.5 text-fleet-ember" />
            Rider
          </span>
          <span className="rounded-fleet bg-fleet-paper px-2 py-2">
            <PackageCheck className="mr-1 inline h-3.5 w-3.5 text-fleet-blue" />
            Drop-off
          </span>
        </div>
      </div>
    </div>
  );
}

function relativeUpdateLabel(value: string) {
  const updatedAt = new Date(value).getTime();
  if (!Number.isFinite(updatedAt)) return "live";
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return "recently";
}

function googleDirectionsUrl(origin: string, destination: string) {
  const params = new URLSearchParams({
    key: googleMapsKey || "",
    origin,
    destination,
    mode: "driving",
    units: "metric"
  });

  return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
}

function statusProgress(status?: string) {
  switch (status) {
    case "pending_payment":
    case "searching":
      return 12;
    case "assigned":
    case "accepted":
    case "rider_arrived":
      return 28;
    case "picked_up":
      return 48;
    case "in_transit":
      return 72;
    case "delivered":
      return 100;
    default:
      return 58;
  }
}

function movementLabel(status?: string) {
  switch (status) {
    case "pending_payment":
      return "Awaiting pay";
    case "searching":
      return "Finding rider";
    case "assigned":
    case "accepted":
      return "To pickup";
    case "rider_arrived":
      return "At pickup";
    case "picked_up":
      return "Trip started";
    case "in_transit":
      return "22 min";
    case "delivered":
      return "Delivered";
    default:
      return "Live ETA";
  }
}
