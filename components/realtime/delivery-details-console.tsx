"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bike, Clock3, MapPinned, PackageCheck, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatDateTime, formatMoney, initials } from "@/lib/format";
import { accountTrackingHref } from "@/lib/tracking-links";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type DeliveryDetails = {
  delivery_code: string;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  vehicle_type?: string | null;
  delivery_speed?: string | null;
  price_ngn: number;
  eta_minutes?: number | null;
  created_at?: string | null;
  rider?: {
    full_name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    vehicle_type?: string | null;
    plate_number?: string | null;
    vehicle_color?: string | null;
  } | null;
};

export function DeliveryDetailsConsole() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code")?.trim().toUpperCase() || "";
  const [delivery, setDelivery] = useState<DeliveryDetails | null>(null);
  const [message, setMessage] = useState(initialCode ? "Loading delivery details..." : "No delivery code was provided.");

  useEffect(() => {
    if (!initialCode) return;
    let mounted = true;
    async function loadDetails() {
      try {
        const response = await fetch(`/api/tracking?code=${encodeURIComponent(initialCode)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { delivery?: DeliveryDetails; error?: string };
        if (!mounted) return;
        if (!response.ok || !payload.delivery) {
          setDelivery(null);
          setMessage(payload.error || "No ongoing delivery was found for that code.");
          return;
        }
        setDelivery(payload.delivery);
        setMessage("");
      } catch {
        if (mounted) setMessage("Delivery details are temporarily unavailable.");
      }
    }
    void loadDetails();
    return () => {
      mounted = false;
    };
  }, [initialCode]);

  return (
    <section className="section-wrap grid gap-5 py-8">
      <Card className="p-5">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Delivery details</span>
        <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-3xl font-black text-fleet-night sm:text-5xl">{delivery?.delivery_code || initialCode || "Delivery"}</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Pickup, drop-off, driver, fee, and live tracking access for this ongoing delivery.</p>
          </div>
          {delivery ? <StatusBadge tone={delivery.status === "delivered" ? "green" : "amber"}>{delivery.status.replaceAll("_", " ")}</StatusBadge> : null}
        </div>
        {message ? <div className="mt-5 rounded-fleet bg-fleet-paper p-3 text-sm font-bold text-slate-600">{message}</div> : null}
      </Card>

      {delivery ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <Card className="p-5">
            <div className="grid gap-3">
              <InfoRow icon={MapPinned} label="Pickup" value={delivery.pickup_address} />
              <InfoRow icon={PackageCheck} label="Drop-off" value={delivery.dropoff_address} />
              <InfoRow icon={Clock3} label="ETA" value={delivery.eta_minutes ? `${delivery.eta_minutes} minutes` : "Updating"} />
              <InfoRow icon={ShieldCheck} label="Created" value={delivery.created_at ? formatDateTime(delivery.created_at) : "Recently"} />
              <InfoRow icon={ShieldCheck} label="Fee" value={formatMoney(delivery.price_ngn || 0)} />
            </div>
            <LinkButton href={accountTrackingHref(delivery.delivery_code)} className="mt-5 w-full bg-fleet-navy hover:bg-fleet-night">
              Live track
            </LinkButton>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <DriverAvatar delivery={delivery} />
              <div>
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Driver</span>
                <h2 className="mt-1 text-xl font-black text-fleet-night">{delivery.rider?.full_name || "Driver assigned"}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {delivery.rider?.vehicle_color || "Vehicle"} {delivery.rider?.vehicle_type || delivery.vehicle_type || "bike"} · {delivery.rider?.plate_number || "Plate pending"}
                </p>
              </div>
            </div>
            <LinkButton href={`tel:${delivery.rider?.phone || ""}`} variant={delivery.rider?.phone ? "primary" : "secondary"} className="mt-5 w-full">
              Call driver
            </LinkButton>
          </Card>
        </div>
      ) : null}
    </section>
  );
}

function DriverAvatar({ delivery }: { delivery: DeliveryDetails }) {
  const name = delivery.rider?.full_name || "Driver";
  if (delivery.rider?.avatar_url) {
    return <Image src={delivery.rider.avatar_url} alt="" width={72} height={72} unoptimized className="h-16 w-16 rounded-full object-cover" />;
  }
  return <span className="grid h-16 w-16 place-items-center rounded-full bg-fleet-navy text-lg font-black text-white">{initials(name)}</span>;
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
