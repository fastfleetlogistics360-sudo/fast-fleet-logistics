"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, Loader2, WalletCards, Wrench } from "lucide-react";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type WalletData = { wallet: { availableBalanceNgn: number; lockedBalanceNgn: number }; maintenanceReserveTotalNgn: number; entries: Array<{ id: string; type: string; amountNgn: number; createdAt: string; assetCode?: string | null }>; withdrawals: Array<{ id: string; amountNgn: number; status: string; createdAt: string; rejectionReason?: string | null }> };

export function InvestorWallet() {
  const [data, setData] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void load(); }, []);
  async function load() {
    const response = await fetch("/api/investor/wallet");
    const result = await response.json().catch(() => ({}));
    if (response.ok) setData(result); else setMessage(result.error || "Could not load your investor wallet.");
  }
  async function requestPayout() {
    if (busy) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/investor/withdrawals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountNgn: Number(amount) }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(result.error || "Could not submit payout request.");
    else { setAmount(""); setMessage("Payout request sent for admin review."); await load(); }
    setBusy(false);
  }
  if (!data) return <Card className="mt-6 p-5 text-sm font-bold text-slate-600">{message || <Loader2 className="h-5 w-5 animate-spin" />}</Card>;
  return <Card className="mt-6 overflow-hidden">
    <div className="border-b border-fleet-line p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-fleet bg-fleet-night text-white"><WalletCards className="h-5 w-5" /></span><div><h2 className="font-black text-fleet-night">Investor wallet</h2><p className="mt-1 text-sm font-semibold text-slate-600">Settled owner share only. This is separate from rider earnings.</p></div></div></div>
    <div className="grid gap-4 p-5 sm:grid-cols-3"><Metric label="Available" value={formatMoney(data.wallet.availableBalanceNgn)} /><Metric label="Pending payout" value={formatMoney(data.wallet.lockedBalanceNgn)} /><Metric label="Maintenance reserve" value={formatMoney(data.maintenanceReserveTotalNgn)} icon={<Wrench className="h-4 w-4" />} /></div>
    <div className="grid gap-5 border-t border-fleet-line p-5 lg:grid-cols-2"><div><h3 className="font-black text-fleet-night">Request a payout</h3><p className="mt-1 text-xs font-bold leading-5 text-slate-500">NGN 2,000–200,000. Your verified payout account is used. An administrator must approve it.</p><div className="mt-3 flex gap-2"><input className="form-input" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Amount in NGN" /><Button type="button" onClick={requestPayout} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}Request</Button></div>{message ? <p className="mt-3 text-sm font-bold text-amber-800">{message}</p> : null}</div><div><h3 className="font-black text-fleet-night">Recent wallet activity</h3><div className="mt-3 grid gap-2">{data.entries.length ? data.entries.slice(0, 5).map((entry) => <div key={entry.id} className="flex justify-between gap-3 rounded-fleet bg-fleet-paper p-3 text-sm"><span><strong>{label(entry.type)}</strong>{entry.assetCode ? ` · ${entry.assetCode}` : ""}<small className="mt-1 block text-xs text-slate-500">{formatDateTime(entry.createdAt)}</small></span><strong className={entry.amountNgn >= 0 ? "text-emerald-700" : "text-fleet-night"}>{entry.amountNgn >= 0 ? "+" : ""}{formatMoney(entry.amountNgn)}</strong></div>) : <p className="text-sm font-semibold text-slate-500">No settled investor activity yet.</p>}</div></div></div>
    {data.withdrawals.length ? <div className="border-t border-fleet-line p-5"><h3 className="font-black text-fleet-night">Payout requests</h3><div className="mt-3 grid gap-2">{data.withdrawals.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-fleet bg-fleet-paper p-3 text-sm"><span><strong>{formatMoney(request.amountNgn)}</strong><small className="ml-2 text-slate-500">{formatDateTime(request.createdAt)}</small>{request.rejectionReason ? <small className="ml-2 text-red-700">{request.rejectionReason}</small> : null}</span><StatusBadge tone={request.status === "paid" ? "green" : request.status === "rejected" ? "red" : "amber"}>{request.status}</StatusBadge></div>)}</div></div> : null}
  </Card>;
}
function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) { return <div className="rounded-fleet bg-fleet-paper p-4"><span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{icon ? <>{icon} </> : null}{label}</span><strong className="mt-1 block text-xl font-black text-fleet-night">{value}</strong></div>; }
function label(type: string) { return type.replaceAll("_", " "); }
