"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ReceiptText, RefreshCw } from "lucide-react";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type TransactionRow = {
  id: string;
  transaction_type: string;
  amount_ngn: number;
  status: string;
  provider?: string | null;
  provider_reference?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

type TransactionHistoryProps = {
  accountKind: "customer" | "rider" | "business";
  title?: string;
  compact?: boolean;
};

export function TransactionHistory({ accountKind, title = "Transaction history", compact = false }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadTransactions() {
      try {
        const response = await fetch(`/api/wallet/transactions?accountKind=${encodeURIComponent(accountKind)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { transactions?: TransactionRow[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not load transactions.");
        if (!mounted) return;
        setTransactions(payload.transactions || []);
        setMessage(null);
      } catch (error) {
        if (mounted) setMessage(error instanceof Error ? error.message : "Could not load transactions.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadTransactions();
    const timer = window.setInterval(loadTransactions, 20000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [accountKind, refreshToken]);

  async function verifyPendingTopUp(transaction: TransactionRow) {
    const reference = transaction.provider_reference?.trim() || "";
    if (!reference) return;

    setVerifyingId(transaction.id);
    setMessage("Checking this top-up directly with Squad. No new charge will be created.");
    try {
      const response = await fetch(`/api/wallet/verify?reference=${encodeURIComponent(reference)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string; status?: string };
      if (response.ok && payload.status === "successful") {
        setTransactions((current) => current.map((item) => item.id === transaction.id ? { ...item, status: "successful" } : item));
        setMessage("Top-up confirmed. Refreshing your wallet balance now.");
        window.setTimeout(() => window.location.reload(), 700);
        return;
      }
      if (response.status === 202) {
        setMessage(payload.message || "Squad is still confirming this payment. Do not top up again; you can safely check again shortly.");
        return;
      }
      setMessage(payload.error || "We could not confirm this payment yet. Do not top up again; contact support if you were charged.");
    } catch {
      setMessage("We could not reach payment verification. Do not top up again; try this safe status check again shortly.");
    } finally {
      setVerifyingId(null);
      setRefreshToken((current) => current + 1);
    }
  }

  const rows = useMemo(() => transactions.slice(0, compact ? 5 : 12), [compact, transactions]);

  return (
    <Card id="transactions" className="mx-auto w-full max-w-4xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-fleet-night">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Top-ups, withdrawals, income, and commission records.</p>
        </div>
        <StatusBadge tone={rows.length ? "blue" : "neutral"}>{rows.length} records</StatusBadge>
      </div>
      {message ? <div className="mt-4 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}
      <div className="mt-4 grid gap-3">
        {loading ? (
          <div className="rounded-fleet bg-fleet-paper p-4 text-sm font-bold text-slate-500">Loading transactions...</div>
        ) : rows.length ? (
          rows.map((transaction) => <TransactionItem key={transaction.id} transaction={transaction} verifying={verifyingId === transaction.id} onVerify={() => void verifyPendingTopUp(transaction)} />)
        ) : (
          <div className="rounded-fleet bg-fleet-paper p-4 text-sm font-bold text-slate-500">No wallet transactions yet.</div>
        )}
      </div>
    </Card>
  );
}

function TransactionItem({ transaction, verifying, onVerify }: { transaction: TransactionRow; verifying: boolean; onVerify: () => void }) {
  const credit = Number(transaction.amount_ngn || 0) >= 0;
  const Icon = credit ? ArrowDownLeft : ArrowUpRight;
  const label = transactionLabel(transaction);
  const canVerifyPendingTopUp = transaction.transaction_type === "wallet_funding" && transaction.provider === "squad" && transaction.status === "pending" && Boolean(transaction.provider_reference);
  return (
    <article className="flex flex-col gap-3 rounded-fleet border border-fleet-line bg-white p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-fleet", credit ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <strong className="block text-sm font-black text-fleet-night">{label}</strong>
          <span className="mt-1 block text-xs font-bold text-slate-500">{formatDateTime(transaction.created_at)}</span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-500">
            <ReceiptText className="h-3.5 w-3.5" />
            <span className="min-w-0 break-all">{transaction.provider_reference || transaction.provider || transaction.id}</span>
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 text-left sm:block sm:text-right">
        <strong className={cn("block text-sm font-black", credit ? "text-emerald-700" : "text-fleet-night")}>
          {credit ? "+" : "-"}{formatMoney(Math.abs(Number(transaction.amount_ngn || 0)))}
        </strong>
        <StatusBadge tone={transaction.status === "successful" ? "green" : transaction.status === "failed" ? "red" : "amber"} className="sm:mt-2">
          {transaction.status}
        </StatusBadge>
        {canVerifyPendingTopUp ? (
          <Button type="button" variant="secondary" size="sm" className="mt-2 w-full sm:w-auto" onClick={onVerify} disabled={verifying}>
            <RefreshCw className={cn("h-3.5 w-3.5", verifying && "animate-spin")} />
            {verifying ? "Checking" : "Check payment"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function transactionLabel(transaction: TransactionRow) {
  const title = transaction.metadata?.title;
  if (typeof title === "string" && title.trim()) return title;
  const labels: Record<string, string> = {
    wallet_funding: transaction.provider === "business_order_checkout" ? "Business order income" : "Wallet top-up",
    delivery_payment: "Delivery payment",
    rider_earning: "Delivery fee earned",
    withdrawal: "Withdrawal request",
    refund: "Refund",
    commission: "Daily commission deduction"
  };
  return labels[transaction.transaction_type] || transaction.transaction_type.replaceAll("_", " ");
}
