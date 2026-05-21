"use client";

import { useState } from "react";
import { Bell, ChevronDown, CreditCard, Eye, EyeOff, Loader2, Minus, Plus, RefreshCw, UserRound } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { walletKycLabel, type WalletKycStatus } from "@/lib/kyc";
import type { WalletType } from "@/types/domain";
import { Button } from "@/components/ui/button";

type WalletDashboardCardProps = {
  userName: string;
  balance: number;
  lockedBalance?: number;
  walletType: Extract<WalletType, "customer" | "rider">;
  kycStatus?: WalletKycStatus;
  returnTo?: string;
  topUpAmount?: string;
  onTopUpAmountChange?: (value: string) => void;
  onWithdraw?: () => void;
  withdrawLoading?: boolean;
  withdrawDisabled?: boolean;
  withdrawLabel?: string;
  notice?: string | null;
  compact?: boolean;
};

export function WalletDashboardCard({
  userName,
  balance,
  lockedBalance = 0,
  walletType,
  kycStatus = "pending",
  returnTo,
  topUpAmount,
  onTopUpAmountChange,
  onWithdraw,
  withdrawLoading = false,
  withdrawDisabled = false,
  withdrawLabel = "Withdraw",
  notice,
  compact = false
}: WalletDashboardCardProps) {
  const [showBalance, setShowBalance] = useState(true);
  const [localAmount, setLocalAmount] = useState("10000");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const amount = topUpAmount ?? localAmount;
  const kycTone =
    kycStatus === "verified"
      ? "bg-fleet-leaf/15 text-fleet-mint"
      : kycStatus === "more_info_needed"
        ? "bg-fleet-ember/20 text-fleet-gold"
        : "bg-white/10 text-white/75";

  function setAmount(value: string) {
    const numeric = value.replace(/[^\d]/g, "");
    if (onTopUpAmountChange) onTopUpAmountChange(numeric);
    else setLocalAmount(numeric);
  }

  async function topUp() {
    const amountNgn = Number(amount);
    setMessage(null);
    if (!Number.isFinite(amountNgn) || amountNgn < 500) {
      setMessage("Enter at least NGN 500.");
      return;
    }

    setTopUpLoading(true);
    try {
      const response = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNgn, walletType, returnTo: returnTo || (walletType === "rider" ? "/rider/dashboard" : "/dashboard") })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not start Paystack top-up.");
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Paystack top-up.");
    } finally {
      setTopUpLoading(false);
    }
  }

  return (
    <section className={cn("overflow-hidden rounded-fleet bg-fleet-night p-5 text-white shadow-[0_24px_70px_rgba(8,17,31,0.28)]", compact ? "sm:p-5" : "sm:p-7")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-4 border-white/80 bg-fleet-gold text-fleet-night shadow-[0_14px_30px_rgba(0,0,0,0.16)] sm:h-16 sm:w-16">
            <UserRound className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-black leading-tight sm:text-4xl">
              Hey <span className="font-semibold">{userName || "there"}</span>,
            </h2>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xl font-black sm:text-2xl">KYC</span>
              <span className={cn("rounded-fleet px-3 py-1.5 text-sm font-black", kycTone)}>{walletKycLabel(kycStatus)}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/5 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] sm:h-20 sm:w-20"
          aria-label="Wallet notifications"
        >
          <Bell className="h-6 w-6" />
          <span className="absolute right-4 top-4 h-3 w-3 rounded-full bg-fleet-mint" />
        </button>
      </div>

      <div className="mt-6 rounded-fleet border border-white/5 bg-fleet-navy/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-sm font-black text-white/45">Available Balance</span>
            <div className="mt-3 flex items-center gap-3">
              <strong className="text-3xl font-black sm:text-5xl">{showBalance ? formatMoney(balance) : "NGN •••••"}</strong>
              <button
                type="button"
                onClick={() => setShowBalance((value) => !value)}
                className="grid h-9 w-9 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label={showBalance ? "Hide balance" : "Show balance"}
              >
                {showBalance ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {lockedBalance > 0 ? <p className="mt-2 text-xs font-bold text-white/55">{showBalance ? formatMoney(lockedBalance) : "NGN •••"} locked</p> : null}
          </div>
          <button
            type="button"
            className="inline-flex min-h-14 items-center justify-center gap-3 rounded-fleet bg-fleet-night/75 px-5 text-lg font-black text-white shadow-[0_16px_36px_rgba(0,0,0,0.22)]"
            aria-label="Currency NGN"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-fleet-leaf">NG</span>
            NGN
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Button type="button" variant="dark" className="min-h-14 bg-fleet-blue/35 text-base hover:bg-fleet-blue/45" onClick={onWithdraw} disabled={withdrawLoading || withdrawDisabled || !onWithdraw}>
            {withdrawLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minus className="h-5 w-5" />}
            {withdrawLabel}
          </Button>
          <Button type="button" variant="dark" className="min-h-14 bg-fleet-blue/35 text-base hover:bg-fleet-blue/45" onClick={topUp} disabled={topUpLoading || Number(amount) < 500}>
            {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
            Top Up
          </Button>
          <Button type="button" variant="dark" className="min-h-14 bg-fleet-blue/35 text-base hover:bg-fleet-blue/45" disabled>
            <RefreshCw className="h-4 w-4" />
            Convert
          </Button>
        </div>

        <div className="mt-4 max-w-xs">
          <label className="form-field">
            <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-white/48">Top-up amount</span>
            <input
              className="min-h-11 w-full rounded-fleet border border-white/10 bg-white/10 px-3 text-sm font-black text-white outline-none placeholder:text-white/35 focus:border-fleet-gold focus:ring-4 focus:ring-fleet-gold/20"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              placeholder="10000"
            />
          </label>
        </div>

        {message || notice ? (
          <div className="mt-4 rounded-fleet bg-fleet-gold/15 p-3 text-xs font-bold leading-5 text-fleet-gold">
            {message || notice}
          </div>
        ) : null}
      </div>
    </section>
  );
}
