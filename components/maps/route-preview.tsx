import { Clock3, MapPin, Route } from "lucide-react";
import { cn } from "@/lib/cn";
import { isUsableAddressText, sanitizeAddressText } from "@/lib/location/address-formatting";
import type { LiveRiderLocation } from "@/components/realtime/use-live-delivery-tracking";
import { FastFleetMap } from "@/components/maps/fastfleet-map";

export function RoutePreview({
  compact = false,
  className,
  label = "Lagos live route",
  status,
  pickupAddress = "Victoria Island, Lagos",
  dropoffAddress = "Ikeja GRA, Lagos",
  riderName = "Fast Fleets rider",
  riderLocation,
  riderAvatarUrl,
  customerAvatarUrl,
  customerName = "Customer",
  distanceKm,
  etaMinutes,
  showRouteCard = false
}: {
  compact?: boolean;
  className?: string;
  label?: string;
  status?: string;
  riderName?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  riderLocation?: LiveRiderLocation | null;
  riderAvatarUrl?: string | null;
  customerAvatarUrl?: string | null;
  customerName?: string;
  distanceKm?: number | null;
  etaMinutes?: number | null;
  showRouteCard?: boolean;
}) {
  const progress = statusProgress(status);
  const origin = usableMapAddress(pickupAddress);
  const destination = usableMapAddress(dropoffAddress);

  return (
    <div className={cn("relative overflow-hidden rounded-fleet", className)}>
      <FastFleetMap
      compact={compact}
      className="border-fleet-line"
      label={label}
      status={status}
      progress={progress}
      pickupAddress={origin || pickupAddress}
      dropoffAddress={destination || dropoffAddress}
      rider={toPoint(riderLocation)}
      riderName={riderName}
      riderAvatarUrl={riderAvatarUrl}
      customerAvatarUrl={customerAvatarUrl}
      customerName={customerName}
      badge={riderLocation ? "Rider live" : "Route preview"}
      />
      {showRouteCard ? (
        <div className="absolute inset-x-3 bottom-3 z-40 rounded-[18px] border border-white/90 bg-white/[0.96] p-3 shadow-[0_16px_40px_rgba(8,17,31,0.18)] backdrop-blur-xl sm:inset-x-4 sm:bottom-4">
          <div className="grid gap-2.5">
            <LocationRow iconClassName="bg-emerald-50 text-emerald-700" label="Pickup" value={origin || pickupAddress} />
            <LocationRow iconClassName="bg-orange-50 text-fleet-ember" label="Delivery" value={destination || dropoffAddress} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-fleet-night">
            {typeof distanceKm === "number" && distanceKm > 0 ? <span className="inline-flex items-center gap-1.5 rounded-full bg-fleet-paper px-2.5 py-1.5"><Route className="h-3.5 w-3.5 text-fleet-ember" />{distanceKm.toFixed(1)} km</span> : null}
            {typeof etaMinutes === "number" && etaMinutes > 0 ? <span className="inline-flex items-center gap-1.5 rounded-full bg-fleet-paper px-2.5 py-1.5"><Clock3 className="h-3.5 w-3.5 text-fleet-ember" />{etaMinutes} min</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LocationRow({ label, value, iconClassName }: { label: string; value: string; iconClassName: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", iconClassName)}><MapPin className="h-3.5 w-3.5" /></span>
      <span className="min-w-0"><span className="block text-[0.58rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span><strong className="line-clamp-1 block text-xs font-black text-fleet-night">{value}</strong></span>
    </div>
  );
}

function usableMapAddress(value?: string) {
  const address = sanitizeAddressText(value || "");
  if (!isUsableAddressText(address)) return "";
  return address;
}

function toPoint(value?: LiveRiderLocation | null) {
  if (!value?.latitude || !value.longitude) return null;
  return { latitude: Number(value.latitude), longitude: Number(value.longitude) };
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
    case "awaiting_delivery_confirmation":
      return 92;
    case "delivered":
      return 100;
    default:
      return 58;
  }
}
