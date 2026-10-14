"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";

export function PickupOrderStatus({ orderId, orderCode, initialStatus, pickupAddress }: { orderId: string; orderCode: string; initialStatus: string; pickupAddress: string | null }) {
  const [status, setStatus] = useState(initialStatus);
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState("Payment Confirmed");
  useEffect(() => {
    if (status !== "ready_for_pickup") return;
    void fetch(`/api/customer/pickup-code?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
      .then(({ response, payload }) => { if (response.ok) { setCode(payload.code || null); setMessage("Ready for Pickup"); } })
      .catch(() => undefined);
  }, [orderId, status]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetch(`/api/customer/pickup-code?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
        .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
        .then(({ response, payload }) => { if (response.ok) { setStatus(payload.status || status); setCode(payload.code || null); setMessage(payload.status === "ready_for_pickup" ? "Ready for Pickup" : "Vendor Preparing"); } })
        .catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [orderId, status]);
  const stages = ["Payment Confirmed", "Vendor Preparing", "Ready for Pickup", "Collected"];
  const active = status === "delivered" ? 3 : status === "ready_for_pickup" ? 2 : status === "preparing" || status === "packing" ? 1 : 0;
  return <section className="section-wrap py-8"><Card className="mx-auto max-w-2xl p-6"><p className="text-xs font-black uppercase tracking-[.16em] text-fleet-ember">Customer pickup</p><h1 className="mt-2 text-3xl font-black text-fleet-night">{message}</h1><p className="mt-2 text-sm font-semibold text-slate-600">Order {orderCode}. Collect from the verified vendor location when notified.</p><div className="mt-6 grid gap-2 sm:grid-cols-4">{stages.map((stage, index) => <div key={stage} className={`rounded-fleet p-3 text-xs font-black ${index <= active ? "bg-emerald-100 text-emerald-900" : "bg-fleet-paper text-slate-500"}`}>{stage}</div>)}</div><div className="mt-6 rounded-fleet bg-fleet-paper p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Pickup address</p><p className="mt-1 text-sm font-bold text-fleet-night">{pickupAddress || "Verified vendor address"}</p></div>{code ? <div className="mt-4 rounded-fleet border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-emerald-800">Your secure handoff code</p><strong className="mt-2 block text-3xl tracking-[.3em] text-fleet-night">{code}</strong><p className="mt-2 text-xs font-bold text-emerald-900">Show this code only to the authenticated vendor at collection.</p></div> : null}<div className="mt-6"><LinkButton href="/dashboard">Customer dashboard</LinkButton></div></Card></section>;
}
