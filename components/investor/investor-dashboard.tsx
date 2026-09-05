"use client";

import { useEffect, useState } from "react";
import { Bike, Loader2, MapPin, PackageCheck, Wrench } from "lucide-react";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { InvestorWallet } from "@/components/investor/investor-wallet";

type DashboardData = {
  investor: { code: string };
  summary: { assetCount: number; completedDeliveries: number; grossDeliveryValueNgn: number };
  assets: Array<{ id: string; assetCode: string; status: string; operatingState?: string | null; operatingZone?: string | null; handlerAssigned: boolean; currentDeliveryStatus?: string | null; completedDeliveries: number; grossDeliveryValueNgn: number }>;
  recentActivity: Array<{ assetCode: string; deliveryCode: string; status: string; occurredAt?: string | null }>;
};

export function InvestorDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [message, setMessage] = useState("Loading your bicycle assets…");

  useEffect(() => { void load(); }, []);
  async function load() {
    const response = await fetch("/api/investor/dashboard");
    const result = await response.json().catch(() => ({}));
    if (response.status === 403 && result.onboardingRequired) { window.location.assign("/investor/activate"); return; }
    if (!response.ok) { setMessage(result.error || "Could not load your investor dashboard."); return; }
    setData(result); setMessage("");
  }

  if (!data) return <section className="section-wrap py-10"><Card className="mx-auto max-w-xl p-6 text-center text-sm font-bold text-slate-600">{message ? message : <Loader2 className="mx-auto h-5 w-5 animate-spin" />}</Card></section>;
  return (
    <section className="section-wrap py-6 sm:py-10">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Investor account · {data.investor.code}</p>
      <h1 className="mt-1 text-3xl font-black text-fleet-night">Your bicycle assets</h1>
      <p className="mt-2 text-sm font-semibold text-slate-600">Asset activity is not investor earnings. Financial settlements are shown only when the investor programme is activated.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Metric label="Bicycle assets" value={String(data.summary.assetCount)} icon={<Bike className="h-5 w-5" />} />
        <Metric label="Completed deliveries" value={String(data.summary.completedDeliveries)} icon={<PackageCheck className="h-5 w-5" />} />
        <Metric label="Gross delivery value" value={formatMoney(data.summary.grossDeliveryValueNgn)} icon={<Wrench className="h-5 w-5" />} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {data.assets.map((asset) => <Card key={asset.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-fleet-night">{asset.assetCode}</h2><p className="mt-1 text-xs font-bold text-slate-500"><MapPin className="mr-1 inline h-3.5 w-3.5" />{[asset.operatingState, asset.operatingZone].filter(Boolean).join(" · ") || "Location not set"}</p></div><StatusBadge tone={statusTone(asset.status)}>{asset.status}</StatusBadge></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-fleet bg-fleet-paper p-3"><span className="block text-xs font-bold text-slate-500">Handler</span><strong>{asset.handlerAssigned ? "Assigned" : "Unassigned"}</strong></div><div className="rounded-fleet bg-fleet-paper p-3"><span className="block text-xs font-bold text-slate-500">Current delivery</span><strong>{asset.currentDeliveryStatus?.replaceAll("_", " ") || "None"}</strong></div><div className="rounded-fleet bg-fleet-paper p-3"><span className="block text-xs font-bold text-slate-500">Completed</span><strong>{asset.completedDeliveries}</strong></div><div className="rounded-fleet bg-fleet-paper p-3"><span className="block text-xs font-bold text-slate-500">Gross delivery value</span><strong>{formatMoney(asset.grossDeliveryValueNgn)}</strong></div></div></Card>)}
      </div>
      <Card className="mt-6 p-5"><h2 className="font-black text-fleet-night">Recent asset activity</h2><div className="mt-4 grid gap-2">{data.recentActivity.length ? data.recentActivity.map((activity, index) => <div key={`${activity.deliveryCode}-${index}`} className="flex flex-wrap justify-between gap-2 rounded-fleet bg-fleet-paper p-3 text-sm"><span><strong>{activity.assetCode}</strong> · {activity.deliveryCode} · {activity.status.replaceAll("_", " ")}</span><span className="text-xs font-bold text-slate-500">{activity.occurredAt ? formatDateTime(activity.occurredAt) : "Recently"}</span></div>) : <p className="text-sm font-semibold text-slate-600">No completed or assigned delivery activity yet.</p>}</div></Card>
      <InvestorWallet />
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <Card className="p-5"><span className="text-fleet-ember">{icon}</span><span className="mt-3 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span><strong className="mt-1 block text-2xl font-black text-fleet-night">{value}</strong></Card>; }
function statusTone(status: string): "green" | "amber" | "red" | "neutral" { if (status === "available") return "green"; if (status === "busy") return "amber"; if (status === "maintenance") return "red"; return "neutral"; }
