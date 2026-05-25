import { Bike, Building2, Home } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LiveRiderLocation } from "@/components/realtime/use-live-delivery-tracking";

const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export function RoutePreview({
  compact = false,
  className,
  label = "Lagos live route",
  status,
  pickupAddress = "Victoria Island, Lagos",
  dropoffAddress = "Ikeja GRA, Lagos"
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
    </div>
  );
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
