"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Banknote, CheckCircle2, Clock3, Loader2, ReceiptText, ShieldCheck, WalletCards, Wrench, X } from "lucide-react";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WalletDashboardCard } from "@/components/wallet/wallet-dashboard-card";

type WalletData = {
  investor: { code: string; status: string; onboardingCompleted: boolean };
  wallet: { availableBalanceNgn: number; lockedBalanceNgn: number };
  maintenanceReserveTotalNgn: number;
  maintenanceReserveEnabled: boolean;
  entries: Array<{ id: string; type: string; amountNgn: number; balanceAfterNgn: number | null; createdAt: string; assetCode?: string | null; grossDeliveryValueNgn?: number | null }>;
  withdrawals: Array<{ id: string; amountNgn: number; status: string; createdAt: string; rejectionReason?: string | null }>;
};

export function InvestorWallet() {
  const [data, setData] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);

  async function load() {
    const response = await fetch("/api/investor/wallet", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      setData(result);
      setMessage("");
    } else setMessage(result.error || "Could not load your investor wallet.");
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(timer);
  }, []);

  async function requestPayout() {
    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount < 2000) return setMessage("Enter an amount of at least NGN 2,000.");
    if (requestedAmount > 200000) return setMessage("Maximum payout request is NGN 200,000.");
    if (requestedAmount > Number(data?.wallet.availableBalanceNgn || 0)) return setMessage("Your request is higher than the available investor balance.");
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/investor/withdrawals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountNgn: requestedAmount }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not submit payout request.");
      setAmount(""); setPayoutOpen(false); setMessage("Payout request sent for Fast Fleets admin review.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit payout request.");
    } finally { setBusy(false); }
  }

  if (!data) return <Card className="mt-6 p-5 text-sm font-bold text-slate-600">{message || <Loader2 className="h-5 w-5 animate-spin" />}</Card>;

  return <section className="mt-6 grid gap-5" aria-label="Investor wallet">
    <WalletDashboardCard userName={data.investor.code || "Investor"} balance={data.wallet.availableBalanceNgn} lockedBalance={data.wallet.lockedBalanceNgn} walletType="rider" accountKind="investor" kycStatus="verified" statusLabel="Account status" returnTo="/investor/dashboard" onWithdraw={() => { setMessage(""); setPayoutOpen(true); }} withdrawLoading={busy} withdrawLabel="Request payout" transactionHref="#investor-wallet-activity" notice="Owner settlements credit here automatically after an assigned bicycle delivery is completed." />
    {message ? <div className="rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}

    <div className="grid gap-3 sm:grid-cols-3">
      <BalanceMetric label="Available to request" value={formatMoney(data.wallet.availableBalanceNgn)} icon={<WalletCards className="h-4 w-4" />} tone="blue" />
      <BalanceMetric label="Payout under review" value={formatMoney(data.wallet.lockedBalanceNgn)} icon={<Clock3 className="h-4 w-4" />} tone="amber" />
      <BalanceMetric label="Maintenance reserve" value={formatMoney(data.maintenanceReserveTotalNgn)} icon={<Wrench className="h-4 w-4" />} tone="emerald" />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <Card id="investor-wallet-activity" className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black text-fleet-night">Settlement activity</h2><p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Every owner credit and payout movement is recorded here.</p></div><StatusBadge tone={data.entries.length ? "blue" : "neutral"}>{data.entries.length} records</StatusBadge></div>
        <div className="mt-4 grid gap-3">{data.entries.length ? data.entries.slice(0, 8).map((entry) => <SettlementEntry key={entry.id} entry={entry} />) : <div className="rounded-fleet bg-fleet-paper p-4 text-sm font-bold text-slate-500">Completed deliveries from an assigned investor bicycle will appear here automatically.</div>}</div>
      </Card>

      <div className="grid content-start gap-5">
        <Card className="p-5">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-fleet bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="font-black text-fleet-night">Your delivery split</h2><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Investor settlement is calculated automatically from the delivery value.</p></div></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center"><Split label="Investor" value={data.maintenanceReserveEnabled ? "55%*" : "60%"} /><Split label="Rider" value="30%" /><Split label="Company" value="10%" /></div>
          <p className="mt-4 text-xs font-bold leading-5 text-slate-500">* A 5% maintenance reserve applies only to future jobs for a bicycle after an administrator enables it. It is never deducted retroactively.</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black text-fleet-night">Payout requests</h2><p className="mt-1 text-sm font-semibold text-slate-500">Manual Fast Fleets payout review.</p></div><Button type="button" size="sm" onClick={() => setPayoutOpen(true)}><Banknote className="h-4 w-4" />Request</Button></div>
          <div className="mt-4 grid gap-2">{data.withdrawals.length ? data.withdrawals.slice(0, 5).map((request) => <WithdrawalEntry key={request.id} request={request} />) : <p className="rounded-fleet bg-fleet-paper p-3 text-sm font-bold text-slate-500">No payout requests yet.</p>}</div>
        </Card>
      </div>
    </div>
    {payoutOpen ? <PayoutModal amount={amount} availableBalance={data.wallet.availableBalanceNgn} busy={busy} message={message} onAmount={setAmount} onClose={() => !busy && setPayoutOpen(false)} onSubmit={requestPayout} /> : null}
  </section>;
}

function BalanceMetric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "blue" | "amber" | "emerald" }) {
  const classes = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700";
  return <div className="rounded-[18px] border border-fleet-line bg-white p-4 shadow-[0_10px_28px_rgba(8,17,31,0.05)]"><span className={`grid h-9 w-9 place-items-center rounded-[12px] ${classes}`}>{icon}</span><span className="mt-4 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span><strong className="mt-1 block text-xl font-black text-fleet-night">{value}</strong></div>;
}

function SettlementEntry({ entry }: { entry: WalletData["entries"][number] }) {
  const credit = entry.amountNgn >= 0;
  const isOwnerShare = entry.type === "delivery_owner_share";
  return <article className="flex items-start justify-between gap-3 rounded-fleet border border-fleet-line bg-white p-3"><div className="flex min-w-0 gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-fleet ${credit ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{credit ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span><div className="min-w-0"><strong className="block text-sm font-black text-fleet-night">{entryLabel(entry.type)}</strong><span className="mt-1 block text-xs font-bold text-slate-500">{entry.assetCode ? `${entry.assetCode} · ` : ""}{formatDateTime(entry.createdAt)}</span>{isOwnerShare && entry.grossDeliveryValueNgn ? <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-500"><ReceiptText className="h-3.5 w-3.5" />From {formatMoney(entry.grossDeliveryValueNgn)} delivery value</span> : null}</div></div><div className="shrink-0 text-right"><strong className={credit ? "block text-sm font-black text-emerald-700" : "block text-sm font-black text-fleet-night"}>{credit ? "+" : "-"}{formatMoney(Math.abs(entry.amountNgn))}</strong>{entry.balanceAfterNgn != null ? <span className="mt-1 block text-xs font-bold text-slate-500">Bal. {formatMoney(entry.balanceAfterNgn)}</span> : null}</div></article>;
}

function WithdrawalEntry({ request }: { request: WalletData["withdrawals"][number] }) {
  const tone = request.status === "paid" || request.status === "approved" ? "green" : request.status === "rejected" ? "red" : "amber";
  return <article className="flex flex-wrap items-center justify-between gap-2 rounded-fleet bg-fleet-paper p-3"><span><strong className="block text-sm font-black text-fleet-night">{formatMoney(request.amountNgn)}</strong><span className="mt-1 block text-xs font-semibold text-slate-500">{formatDateTime(request.createdAt)}</span>{request.rejectionReason ? <span className="mt-1 block text-xs font-bold text-red-700">{request.rejectionReason}</span> : null}</span><StatusBadge tone={tone}>{request.status}</StatusBadge></article>;
}

function Split({ label, value }: { label: string; value: string }) { return <div className="rounded-fleet bg-fleet-paper p-3"><strong className="block text-lg font-black text-fleet-night">{value}</strong><span className="text-xs font-bold text-slate-500">{label}</span></div>; }

function PayoutModal({ amount, availableBalance, busy, message, onAmount, onClose, onSubmit }: { amount: string; availableBalance: number; busy: boolean; message: string; onAmount: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return <div className="fixed inset-0 z-[80] grid place-items-end bg-slate-950/45 p-3 backdrop-blur-sm sm:place-items-center" role="presentation"><Card role="dialog" aria-modal="true" aria-labelledby="investor-payout-title" className="w-full max-w-md p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Investor wallet</span><h2 id="investor-payout-title" className="mt-1 text-2xl font-black text-fleet-night">Request a payout</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Available: {formatMoney(availableBalance)}. Fast Fleets admin reviews each request before payment.</p></div><button type="button" onClick={onClose} disabled={busy} className="grid h-9 w-9 place-items-center rounded-fleet text-slate-500 transition hover:bg-fleet-paper hover:text-fleet-night" aria-label="Close payout request"><X className="h-5 w-5" /></button></div><label className="form-field mt-5"><span className="form-label">Amount in NGN</span><input autoFocus className="form-input" value={amount} onChange={(event) => onAmount(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Minimum NGN 2,000" /></label>{message ? <p className="mt-3 rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</p> : null}<div className="mt-5 grid gap-2 sm:grid-cols-2"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="button" onClick={onSubmit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Submit request</Button></div></Card></div>;
}

function entryLabel(type: string) {
  const labels: Record<string, string> = { delivery_owner_share: "Owner delivery share", withdrawal_hold: "Payout request placed", withdrawal_released: "Payout request released", withdrawal_paid: "Payout paid" };
  return labels[type] || type.replaceAll("_", " ");
}
