"use client";

import { useState } from "react";
import { CreditCard, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { WalletType } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type WalletTransaction = {
  id?: string;
  transaction_type: string;
  amount_ngn: number;
  status: string;
  provider?: string | null;
  provider_reference?: string | null;
  created_at?: string;
};

export function WalletCard({
  title = "Wallet",
  balance,
  lockedBalance = 0,
  walletType,
  transactions = [],
  helper,
  returnTo
}: {
  title?: string;
  balance: number;
  lockedBalance?: number;
  walletType: WalletType;
  transactions?: WalletTransaction[];
  helper?: string;
  returnTo?: string;
}) {
  const [amount, setAmount] = useState("10000");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function topUp() {
    const amountNgn = Number(amount);
    if (!Number.isFinite(amountNgn) || amountNgn < 500) {
      setMessage("Enter a wallet top-up amount of at least NGN 500.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNgn, walletType, returnTo: returnTo || (walletType === "rider" ? "/rider/dashboard" : "/dashboard") })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not start wallet funding.");
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start wallet funding.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-fleet-line bg-fleet-night p-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-fleet-gold">
              <Wallet className="h-4 w-4" />
              {title}
            </span>
            <strong className="mt-3 block text-4xl font-black">{formatMoney(balance)}</strong>
            <p className="mt-2 text-sm font-semibold text-white/70">{helper || "Fund, spend, refund, and reconcile from one balance."}</p>
          </div>
          <StatusBadge tone="green" className="bg-emerald-400/15 text-emerald-100">
            Paystack ready
          </StatusBadge>
        </div>
        {lockedBalance > 0 ? (
          <div className="mt-4 rounded-fleet border border-white/10 bg-white/10 p-3 text-sm font-bold text-white/80">
            {formatMoney(lockedBalance)} locked for active deliveries
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="grid gap-3">
          <label className="form-field">
            <span className="form-label">Top up amount</span>
            <input
              className="form-input"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="10000"
            />
          </label>
          <Button type="button" onClick={topUp} disabled={loading || Number(amount) < 500}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Top up with Paystack
          </Button>
          <div className="flex items-start gap-2 rounded-fleet bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Payment is verified server-side before your wallet is credited.
          </div>
          {message ? <div className="rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}
        </div>

        <div>
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Transaction history</span>
          <div className="mt-3 grid gap-2">
            {transactions.length ? (
              transactions.slice(0, 8).map((transaction, index) => (
                <TransactionCard key={transaction.id || `${transaction.transaction_type}-${index}`} transaction={transaction} />
              ))
            ) : (
              <div className="rounded-fleet border border-dashed border-fleet-line bg-fleet-paper p-4 text-sm font-bold leading-6 text-slate-500">
                No wallet transactions yet. Successful Paystack top-ups and checkout payments will appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TransactionCard({ transaction }: { transaction: WalletTransaction }) {
  const status = transaction.status || "pending";
  const statusClass =
    status === "successful"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "failed"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : status === "pending"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-50 text-slate-700";
  const amountClass = transaction.amount_ngn < 0 ? "text-rose-700" : "text-emerald-700";

  return (
    <div className={`flex items-center justify-between gap-4 rounded-fleet border p-3 ${statusClass}`}>
      <span className="min-w-0">
        <strong className="block text-sm font-black text-fleet-night">{transactionLabel(transaction.transaction_type)}</strong>
        <span className="mt-1 block truncate text-xs font-bold">
          {statusLabel(status)}
          {transaction.provider ? ` · ${providerLabel(transaction.provider)}` : ""}
        </span>
      </span>
      <strong className={`shrink-0 text-right ${amountClass}`}>
        {transaction.amount_ngn < 0 ? "-" : "+"}
        {formatMoney(Math.abs(transaction.amount_ngn))}
      </strong>
    </div>
  );
}

function transactionLabel(type: string) {
  if (type === "wallet_funding") return "Wallet top up";
  if (type === "delivery_payment") return "Check out payment";
  return type.replaceAll("_", " ");
}

function statusLabel(status: string) {
  if (status === "successful") return "Successful";
  if (status === "failed") return "Failed";
  if (status === "pending") return "Pending";
  return status.replaceAll("_", " ");
}

function providerLabel(provider: string) {
  return provider === "paystack" ? "Paystack" : provider.replaceAll("_", " ");
}
