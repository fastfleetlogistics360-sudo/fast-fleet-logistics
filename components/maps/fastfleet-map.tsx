import { Home, Navigation2, Route } from "lucide-react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

export type FastFleetMapPoint = {
  latitude: number;
  longitude: number;
};

type MapPinKind = "pickup" | "rider" | "customer";

type FastFleetMapProps = {
  className?: string;
  compact?: boolean;
  label?: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  status?: string;
  pickup?: FastFleetMapPoint | null;
  rider?: FastFleetMapPoint | null;
  dropoff?: FastFleetMapPoint | null;
  progress?: number;
  pickupAddress?: string;
  dropoffAddress?: string;
  riderName?: string;
  customerName?: string;
  riderAvatarUrl?: string | null;
  customerAvatarUrl?: string | null;
  showLegend?: boolean;
};

type LayoutPoint = {
  x: number;
  y: number;
};

export function FastFleetMap({
  className,
  compact = false,
  label = "FastFleets 360 live map",
  title,
  subtitle,
  badge,
  status,
  pickup,
  rider,
  dropoff,
  progress,
  pickupAddress,
  dropoffAddress,
  riderName = "Rider",
  customerName = "Customer",
  riderAvatarUrl,
  customerAvatarUrl,
  showLegend = true
}: FastFleetMapProps) {
  const routeProgress = progress ?? statusProgress(status);
  const points = mapLayoutPoints(pickup, dropoff, rider, routeProgress);
  const path = routePath(points.pickup, points.dropoff);
  const riderPoint = rider ? points.rider : pointOnRoute(points.pickup, points.dropoff, routeProgress / 100);
  const displayTitle = title || statusLabel(status);
  const displaySubtitle = subtitle || routeSubtitle(pickupAddress, dropoffAddress);

  return (
    <div className={cn("fastfleet-map relative isolate overflow-hidden rounded-fleet border border-white/70 bg-fleet-night shadow-[0_24px_70px_rgba(8,17,31,0.18)]", compact ? "min-h-[220px]" : "min-h-[360px]", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(244,166,42,0.28),transparent_19rem),radial-gradient(circle_at_88%_12%,rgba(21,163,107,0.22),transparent_18rem),linear-gradient(135deg,#08111f,#0f3460_54%,#10243d)]" />
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.32)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_center,transparent_0,transparent_44%,rgba(8,17,31,.42)_100%)]" />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="fastfleet-route-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#15a36b" />
            <stop offset="45%" stopColor="#f4a62a" />
            <stop offset="100%" stopColor="#ef6c00" />
          </linearGradient>
        </defs>
        <path d="M -8 30 C 18 18, 34 20, 56 34 S 87 56, 108 45" className="fastfleet-map-road" />
        <path d="M -10 72 C 14 63, 34 66, 50 80 S 78 91, 110 72" className="fastfleet-map-road fastfleet-map-road-soft" />
        <path d="M 18 -6 C 26 20, 28 44, 20 108" className="fastfleet-map-road fastfleet-map-road-soft" />
        <path d="M 76 -8 C 68 18, 70 43, 88 108" className="fastfleet-map-road fastfleet-map-road-soft" />
        <path d={path} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" />
        <path d={path} fill="none" stroke="rgba(8,17,31,0.35)" strokeWidth="6.8" strokeLinecap="round" />
        <path d={path} fill="none" stroke="url(#fastfleet-route-gradient)" strokeWidth="4.2" strokeLinecap="round" />
        <path d={path} fill="none" stroke="rgba(255,255,255,0.86)" strokeWidth="1.35" strokeLinecap="round" strokeDasharray="3 6" className="fastfleet-map-dash" />
      </svg>

      <MapAvatarPin
        kind="pickup"
        label="Pickup"
        name="Pickup"
        point={points.pickup}
      />
      <MapAvatarPin
        kind="customer"
        label="Customer"
        name={customerName}
        avatarUrl={customerAvatarUrl}
        point={points.dropoff}
      />
      <MapAvatarPin
        kind="rider"
        label={rider ? "Rider live" : "Rider ETA"}
        name={riderName}
        avatarUrl={riderAvatarUrl}
        point={riderPoint}
      />

      <div className="absolute left-4 top-4 z-20 max-w-[78%] rounded-[16px] border border-white/15 bg-white/[0.12] px-3 py-2 text-white shadow-[0_18px_48px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-black uppercase tracking-[0.16em] text-fleet-gold">
          <Navigation2 className="h-3.5 w-3.5" />
          {label}
        </span>
        <strong className="mt-1 block text-base font-black leading-tight sm:text-lg">{displayTitle}</strong>
      </div>

      {showLegend ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 rounded-[18px] border border-white/80 bg-white/[0.94] p-3 text-fleet-night shadow-[0_18px_48px_rgba(8,17,31,0.18)] backdrop-blur-xl sm:inset-x-5 sm:bottom-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0">
              <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">
                <Route className="h-4 w-4" />
                Branded route
              </span>
              <strong className="mt-1 line-clamp-1 block text-sm font-black sm:text-base">{displaySubtitle}</strong>
            </span>
            <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
              {badge || `${Math.round(routeProgress)}% route`}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MapAvatarPin({ kind, label, name, avatarUrl, point }: { kind: MapPinKind; label: string; name: string; avatarUrl?: string | null; point: LayoutPoint }) {
  const isRider = kind === "rider";
  const isCustomer = kind === "customer";
  return (
    <div
      className="absolute z-30 -translate-x-1/2 -translate-y-full transition-[left,top] duration-700 ease-out"
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
    >
      <div className={cn("relative grid h-[4.35rem] w-[3.25rem] place-items-center", isRider && "fastfleet-map-rider")}>
        <span className={cn("absolute inset-x-1 top-1 h-11 rounded-full blur-md", isRider ? "bg-fleet-gold/55" : isCustomer ? "bg-fleet-ember/40" : "bg-fleet-leaf/42")} />
        <span className={cn("relative grid h-[3.1rem] w-[3.1rem] place-items-center rounded-full border-[3px] bg-white shadow-[0_18px_36px_rgba(0,0,0,0.28)]", isRider ? "border-fleet-gold" : isCustomer ? "border-fleet-ember" : "border-fleet-leaf")}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className={cn("grid h-full w-full place-items-center rounded-full text-sm font-black", isRider ? "bg-fleet-night text-white" : isCustomer ? "bg-orange-50 text-fleet-ember" : "bg-emerald-50 text-fleet-leaf")}>
              {kind === "pickup" ? <Home className="h-5 w-5" /> : isRider ? initials(name || "Rider") : initials(name || "Customer")}
            </span>
          )}
        </span>
        <span className={cn("relative -mt-1 h-4 w-4 rotate-45 rounded-[4px] shadow-[6px_8px_18px_rgba(0,0,0,0.2)]", isRider ? "bg-fleet-gold" : isCustomer ? "bg-fleet-ember" : "bg-fleet-leaf")} />
        <span className="absolute -bottom-1 left-1/2 h-2 w-8 -translate-x-1/2 rounded-full bg-black/20 blur-[2px]" />
      </div>
      <span className="absolute left-1/2 top-[3.6rem] hidden -translate-x-1/2 whitespace-nowrap rounded-full border border-white/70 bg-white/95 px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.1em] text-fleet-night shadow-lift sm:block">
        {label}
      </span>
      {isRider ? <span className="absolute left-1/2 top-[-0.35rem] h-4 w-4 -translate-x-1/2 animate-pulseSoft rounded-full bg-fleet-gold shadow-[0_0_0_12px_rgba(244,166,42,0.18)]" /> : null}
    </div>
  );
}

function mapLayoutPoints(pickup: FastFleetMapPoint | null | undefined, dropoff: FastFleetMapPoint | null | undefined, rider: FastFleetMapPoint | null | undefined, progress: number) {
  if (!pickup || !dropoff) {
    const start = { x: 16, y: 31 };
    const end = { x: 83, y: 70 };
    return {
      pickup: start,
      rider: rider ? { x: 52, y: 45 } : pointOnRoute(start, end, progress / 100),
      dropoff: end
    };
  }

  const points = [pickup, dropoff, rider].filter(Boolean) as FastFleetMapPoint[];
  const minLat = Math.min(...points.map((point) => point.latitude));
  const maxLat = Math.max(...points.map((point) => point.latitude));
  const minLng = Math.min(...points.map((point) => point.longitude));
  const maxLng = Math.max(...points.map((point) => point.longitude));
  const toXY = (point: FastFleetMapPoint) => ({
    x: 13 + ((point.longitude - minLng) / Math.max(0.0001, maxLng - minLng)) * 74,
    y: 16 + (1 - (point.latitude - minLat) / Math.max(0.0001, maxLat - minLat)) * 66
  });

  const start = toXY(pickup);
  const end = toXY(dropoff);
  return {
    pickup: start,
    rider: rider ? toXY(rider) : pointOnRoute(start, end, progress / 100),
    dropoff: end
  };
}

function routePath(pickup: LayoutPoint, dropoff: LayoutPoint) {
  const c1 = { x: pickup.x + 12, y: Math.max(12, pickup.y - 20) };
  const c2 = { x: dropoff.x - 20, y: Math.min(88, dropoff.y + 20) };
  return `M ${pickup.x} ${pickup.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${dropoff.x} ${dropoff.y}`;
}

function pointOnRoute(pickup: LayoutPoint, dropoff: LayoutPoint, rawProgress: number) {
  const t = Math.max(0, Math.min(1, rawProgress));
  const c1 = { x: pickup.x + 12, y: Math.max(12, pickup.y - 20) };
  const c2 = { x: dropoff.x - 20, y: Math.min(88, dropoff.y + 20) };
  const mt = 1 - t;
  return {
    x: mt ** 3 * pickup.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * dropoff.x,
    y: mt ** 3 * pickup.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * dropoff.y
  };
}

function routeSubtitle(pickupAddress?: string, dropoffAddress?: string) {
  if (pickupAddress && dropoffAddress) return `${pickupAddress} to ${dropoffAddress}`;
  if (dropoffAddress) return `Delivering to ${dropoffAddress}`;
  if (pickupAddress) return `Pickup at ${pickupAddress}`;
  return "Live route preview";
}

function statusProgress(status?: string) {
  switch (status) {
    case "pending_payment":
    case "draft":
    case "quoted":
      return 8;
    case "searching":
    case "received":
      return 16;
    case "assigned":
    case "accepted":
      return 30;
    case "rider_arrived":
      return 40;
    case "picked_up":
      return 55;
    case "in_transit":
      return 76;
    case "awaiting_delivery_confirmation":
      return 92;
    case "delivered":
      return 100;
    case "cancelled":
      return 18;
    default:
      return 58;
  }
}

function statusLabel(status?: string) {
  if (!status) return "Live route";
  if (status === "pending_payment") return "Awaiting payment";
  if (status === "searching") return "Finding rider";
  if (status === "received") return "Order received";
  if (status === "assigned" || status === "accepted") return "Rider assigned";
  if (status === "rider_arrived") return "Rider at pickup";
  if (status === "picked_up") return "Package picked up";
  if (status === "in_transit") return "On the way";
  if (status === "awaiting_delivery_confirmation") return "Awaiting confirmation";
  if (status === "delivered") return "Delivered";
  if (status === "cancelled") return "Cancelled";
  return status.replaceAll("_", " ");
}
