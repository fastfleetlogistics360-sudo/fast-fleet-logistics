"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { accountMessengerHref } from "@/lib/tracking-links";

type MessengerOrder = {
  id?: string | null;
  delivery_code?: string | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  status?: string | null;
  rider_profiles?: {
    users?: {
      full_name?: string | null;
    } | null;
  } | null;
};

const messengerStatuses = new Set(["pending", "searching", "assigned", "accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation", "rider_assigned"]);

export function ActiveOrderMessengerSheet({
  orders,
  hrefForOrder,
  className
}: {
  orders: MessengerOrder[];
  hrefForOrder?: (order: MessengerOrder) => string;
  className?: string;
}) {
  const activeOrder = useMemo(
    () => orders.find((order) => messengerStatuses.has(String(order.status || ""))) || null,
    [orders]
  );
  const sheetKey = activeOrder ? `${activeOrder.delivery_code || activeOrder.id}:${activeOrder.status}` : "";
  const [visibleKey, setVisibleKey] = useState<string | null>(null);

  useEffect(() => {
    if (!sheetKey) {
      setVisibleKey(null);
      return;
    }
    try {
      if (window.localStorage.getItem(storageKey(sheetKey)) === "1") {
        setVisibleKey(null);
        return;
      }
    } catch {
      // The sheet can still show if browser storage is unavailable.
    }
    const timer = window.setTimeout(() => setVisibleKey(sheetKey), 320);
    return () => window.clearTimeout(timer);
  }, [sheetKey]);

  if (!activeOrder || visibleKey !== sheetKey) return null;

  const href = hrefForOrder ? hrefForOrder(activeOrder) : accountMessengerHref(activeOrder.delivery_code || activeOrder.id);
  const riderName = activeOrder.rider_profiles?.users?.full_name || "Your rider";
  const route = [activeOrder.pickup_address, activeOrder.dropoff_address].filter(Boolean).join(" to ");

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey(sheetKey), "1");
    } catch {
      // Dismiss for this render even if storage is unavailable.
    }
    setVisibleKey(null);
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Ongoing delivery messenger"
      className={cn(
        "fixed inset-x-3 bottom-24 z-[60] mx-auto max-w-sm rounded-[20px] border border-white/80 bg-white/95 p-3 shadow-[0_20px_55px_rgba(8,17,31,0.20)] ring-1 ring-fleet-line/30 backdrop-blur-2xl lg:bottom-5",
        className
      )}
    >
      <button type="button" onClick={dismiss} className="mx-auto mb-2 block h-1 w-12 rounded-full bg-slate-300" aria-label="Dismiss messenger prompt" />
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] bg-fleet-night text-white shadow-[0_10px_24px_rgba(8,17,31,0.18)]">
          <MessageCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span>
              <span className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-fleet-ember">Ongoing job</span>
              <h2 className="mt-0.5 text-base font-black leading-tight text-fleet-night">{statusHeadline(String(activeOrder.status || ""))}</h2>
            </span>
            <button type="button" onClick={dismiss} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fleet-paper text-slate-500" aria-label="Close messenger prompt">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-600">{riderName} is connected. Open the messenger for live updates.</p>
          {route ? <p className="mt-1 line-clamp-1 text-[0.7rem] font-bold leading-4 text-slate-500">{route}</p> : null}
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <Link href={href} className="inline-flex min-h-10 items-center justify-center rounded-[13px] bg-fleet-night px-3 text-xs font-black text-white transition hover:bg-fleet-ember">
              Open messenger
            </Link>
            <Button type="button" variant="secondary" onClick={dismiss}>Later</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function storageKey(key: string) {
  return `fastfleet.messenger-sheet.dismissed:${key}`;
}

function statusHeadline(status: string) {
  if (status === "pending" || status === "searching") return "Finding a rider";
  if (status === "assigned") return "Rider assignment started";
  if (status === "accepted" || status === "rider_assigned") return "Rider accepted your job";
  if (status === "rider_arrived") return "Rider is at pickup";
  if (status === "picked_up") return "Package has been picked up";
  if (status === "in_transit") return "Delivery is in transit";
  if (status === "awaiting_delivery_confirmation") return "Awaiting secure handoff confirmation";
  return "Delivery messenger is ready";
}
