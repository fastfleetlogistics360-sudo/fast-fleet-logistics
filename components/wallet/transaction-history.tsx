"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from "lucide-react";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
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
  }, [accountKind]);

  const rows = useMemo(() => transactions.slice(0, compact ? 5 : 12), [compact, transactions]);

  return (
    <Card id="transactions" className="p-5">
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
          rows.map((transaction) => <TransactionItem key={transaction.id} transaction={transaction} />)
        ) : (
          <div className="rounded-fleet bg-fleet-paper p-4 text-sm font-bold text-slate-500">No wallet transactions yet.</div>
        )}
      </div>
    </Card>
  );
}

function TransactionItem({ transaction }: { transaction: TransactionRow }) {
  const credit = Number(transaction.amount_ngn || 0) >= 0;
  const Icon = credit ? ArrowDownLeft : ArrowUpRight;
  const label = transactionLabel(transaction);
  return (
    <article className="flex items-start justify-between gap-3 rounded-fleet border border-fleet-line bg-white p-3">
      <div className="flex min-w-0 gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-fleet", credit ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <strong className="block text-sm font-black text-fleet-night">{label}</strong>
          <span className="mt-1 block text-xs font-bold text-slate-500">{formatDateTime(transaction.created_at)}</span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-500">
            <ReceiptText className="h-3.5 w-3.5" />
            {transaction.provider_reference || transaction.provider || transaction.id}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <strong className={cn("block text-sm font-black", credit ? "text-emerald-700" : "text-fleet-night")}>
          {credit ? "+" : "-"}{formatMoney(Math.abs(Number(transaction.amount_ngn || 0)))}
        </strong>
        <StatusBadge tone={transaction.status === "successful" ? "green" : transaction.status === "failed" ? "red" : "amber"} className="mt-2">
          {transaction.status}
        </StatusBadge>
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
