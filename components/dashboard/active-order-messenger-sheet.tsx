"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { accountMessengerHref } from "@/lib/tracking-links";
import { pickupProofFromMetadata } from "@/lib/pickup-proof";

type MessengerOrder = {
  id?: string | null;
  delivery_id?: string | null;
  delivery_code?: string | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
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
  const proof = pickupProofFromMetadata(activeOrder.metadata);
  const proofDeliveryId = activeOrder.delivery_id || activeOrder.id || null;
  const showFastConfirmPreview = Boolean(proof?.url && proofDeliveryId);
  const proofVersion = typeof proof?.uploaded_at === "string" ? proof.uploaded_at : "";

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
        "fixed inset-x-3 bottom-24 z-[60] mx-auto max-w-md rounded-[17px] border border-white/80 bg-white/95 p-2.5 shadow-[0_16px_42px_rgba(8,17,31,0.18)] ring-1 ring-fleet-line/30 backdrop-blur-2xl lg:bottom-5",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[11px] bg-fleet-night text-white shadow-[0_8px_18px_rgba(8,17,31,0.16)]">
          <MessageCircle className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span>
              <span className="text-[0.58rem] font-black uppercase tracking-[0.12em] text-fleet-ember">Delivery update</span>
              <h2 className="mt-0.5 text-sm font-black leading-tight text-fleet-night">{statusHeadline(String(activeOrder.status || ""))}</h2>
            </span>
            <button type="button" onClick={dismiss} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fleet-paper text-slate-500" aria-label="Close messenger prompt">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[0.72rem] font-semibold leading-4 text-slate-600">
            {showFastConfirmPreview ? "FastConfirm photo is ready for your review." : `${riderName} is connected. Live updates appear here as they arrive.`}
          </p>
          {route ? <p className="mt-1 line-clamp-1 text-[0.65rem] font-bold leading-4 text-slate-500">{route}</p> : null}
          {showFastConfirmPreview ? (
            <Link href={href} className="mt-2 flex items-center gap-2 rounded-[11px] border border-fleet-gold/40 bg-amber-50/70 p-1.5">
              <Image
                src={`/api/uploads/access?scope=delivery-proof&id=${encodeURIComponent(proofDeliveryId || "")}&v=${encodeURIComponent(proofVersion)}`}
                alt="FastConfirm package photo"
                width={80}
                height={52}
                priority
                unoptimized
                className="h-10 w-14 rounded-[8px] object-cover"
              />
              <span className="min-w-0 text-[0.7rem] font-black leading-4 text-fleet-night">FastConfirm photo<br /><span className="font-semibold text-slate-500">Tap to review</span></span>
            </Link>
          ) : null}
          <div className="mt-2">
            <Link href={href} className="inline-flex min-h-9 w-full items-center justify-center rounded-[11px] bg-fleet-night px-3 text-xs font-black text-white transition hover:bg-fleet-ember">
              Open delivery messenger
            </Link>
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
