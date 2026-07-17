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
  customerName = "Customer"
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
}) {
  const progress = statusProgress(status);
  const origin = usableMapAddress(pickupAddress);
  const destination = usableMapAddress(dropoffAddress);

  return (
    <FastFleetMap
      compact={compact}
      className={cn("border-fleet-line", className)}
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
