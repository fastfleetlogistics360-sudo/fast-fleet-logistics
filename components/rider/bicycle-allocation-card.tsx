"use client";

import { useEffect, useState } from "react";
import { Bike, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type BicyclePayload = { bicycleApplicant: boolean; approved?: boolean; asset: { code: string; status: string; ownership: string; operatingState?: string | null; operatingZone?: string | null } | null };

export function BicycleAllocationCard() {
  const [payload, setPayload] = useState<BicyclePayload | null>(null);
  useEffect(() => {
    let mounted = true;
    const load = () => fetch("/api/rider/bicycle", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((result) => { if (mounted && result) setPayload(result); }).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 30000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);
  if (!payload) return <Card className="grid min-h-24 place-items-center p-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></Card>;
  if (!payload.bicycleApplicant) return null;
  if (!payload.asset) return <Card className="border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-fleet-ember"><Bike className="h-5 w-5" /></span><div><p className="text-xs font-black uppercase tracking-[0.14em] text-amber-800">My assigned bicycle</p><h2 className="mt-1 text-lg font-black text-fleet-night">{payload.approved ? "Awaiting bicycle assignment" : "Application review in progress"}</h2><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{payload.approved ? "Fleet Operations will assign a real Fast Fleets 360 bicycle before you can go online for bicycle deliveries." : "Your bicycle application is not an allocation. We will update your dashboard after review."}</p></div></div></Card>;
  const available = payload.asset.status === "available";
  return <Card className="border-fleet-navy/15 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fleet-navy text-white"><Bike className="h-5 w-5" /></span><div><p className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">My assigned bicycle</p><h2 className="mt-1 text-lg font-black text-fleet-night">{payload.asset.code}</h2></div></div><StatusBadge tone={available ? "green" : "amber"}>{available ? "Assigned · available" : payload.asset.status.replaceAll("_", " ")}</StatusBadge></div><div className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><Info label="Ownership" value={payload.asset.ownership} /><Info label="Operating zone" value={payload.asset.operatingZone || "Not recorded"} /><Info label="State" value={payload.asset.operatingState || "Not recorded"} /></div><p className="mt-4 text-xs font-bold leading-5 text-slate-500">Earnings are calculated from this bicycle’s ownership at completed delivery by the existing payout system.</p></Card>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-fleet bg-fleet-paper p-3"><p className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-slate-500">{label}</p><p className="mt-1 font-bold text-fleet-night">{value}</p></div>;
}
