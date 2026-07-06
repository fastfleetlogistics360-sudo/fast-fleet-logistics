"use client";

import { useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, Loader2, Minus, PackageSearch, Plus, RefreshCw, WalletCards } from "lucide-react";
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
  accountKind?: "customer" | "rider" | "business";
  kycStatus?: WalletKycStatus;
  returnTo?: string;
  topUpAmount?: string;
  onWithdraw?: () => void;
  withdrawLoading?: boolean;
  withdrawDisabled?: boolean;
  withdrawLabel?: string;
  trackHref?: string;
  transactionHref?: string;
  notice?: string | null;
  compact?: boolean;
};

export function WalletDashboardCard({
  userName,
  balance,
  lockedBalance = 0,
  walletType,
  accountKind = walletType === "rider" ? "rider" : "customer",
  kycStatus = "pending",
  returnTo,
  topUpAmount,
  onWithdraw,
  withdrawLoading = false,
  withdrawDisabled = false,
  withdrawLabel = "Withdraw",
  trackHref = "/track",
  transactionHref,
  notice,
  compact = false
}: WalletDashboardCardProps) {
  const [showBalance, setShowBalance] = useState(true);
  const [localAmount] = useState("10000");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const amount = topUpAmount ?? localAmount;
  const kycTone =
    kycStatus === "verified"
      ? "border-emerald-300/25 bg-emerald-400/15 text-emerald-300"
      : kycStatus === "more_info_needed"
        ? "border-amber-200/25 bg-amber-300/15 text-amber-200"
        : "border-white/10 bg-white/10 text-white/75";
  const cardLabel = accountKind === "business" ? "Business wallet" : accountKind === "rider" ? "Rider wallet" : "Customer wallet";

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
      if (!response.ok) throw new Error(data.error || "Could not start Squad top-up.");
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Squad top-up.");
    } finally {
      setTopUpLoading(false);
    }
  }

  const canWithdraw = Boolean(onWithdraw) || accountKind === "rider" || accountKind === "business";
  const showTopUp = accountKind === "customer";
  const historyHref = transactionHref || (accountKind === "rider" ? "/rider/dashboard/earnings" : accountKind === "business" ? "/business/dashboard#transactions" : "/dashboard#transactions");

  function openHref(href: string) {
    window.location.assign(href);
  }

  return (
    <section className="w-full max-w-full overflow-hidden" aria-label={`${cardLabel} for ${userName || "account"}`}>
      <div className={cn("relative overflow-hidden rounded-[24px] bg-[#061f3d] p-5 text-white shadow-[0_24px_70px_rgba(8,31,61,0.28)] sm:p-6", compact ? "sm:p-5" : "sm:p-7")}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,255,255,0.14),transparent_30%),linear-gradient(135deg,rgba(8,41,78,0.94),rgba(2,19,42,0.98))]" />
        <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-fleet-blue/30 blur-2xl" />
        <WalletIllustration />

        <div className="relative z-10 min-w-0 pr-24 sm:pr-40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white/85">KYC Status</span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1 text-sm font-black", kycTone)}>
              {walletKycLabel(kycStatus)}
              {kycStatus === "verified" ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
          </div>

          <div className="mt-8 sm:mt-10">
            <span className="text-sm font-semibold text-white/85">Available Balance</span>
            <div className="mt-2 flex min-w-0 items-center gap-3">
              <strong className="min-w-0 break-words text-[2rem] font-black leading-none tracking-normal sm:text-5xl">{showBalance ? formatMoney(balance) : "NGN •••••"}</strong>
              <button
                type="button"
                onClick={() => setShowBalance((value) => !value)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white"
                aria-label={showBalance ? "Hide balance" : "Show balance"}
              >
                {showBalance ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </button>
            </div>
            {lockedBalance > 0 ? <p className="mt-2 text-xs font-bold text-white/75">{showBalance ? formatMoney(lockedBalance) : "NGN •••"} locked</p> : null}
          </div>

          <button
            type="button"
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-3 rounded-[14px] border border-white/10 bg-[#04172f]/85 px-4 text-sm font-black text-white shadow-[0_14px_30px_rgba(0,0,0,0.22)]"
            aria-label="Currency NGN"
          >
            <span className="flex h-6 w-6 overflow-hidden rounded-full ring-2 ring-white/10" aria-hidden="true">
              <span className="flex-1 bg-emerald-500" />
              <span className="flex-1 bg-white" />
              <span className="flex-1 bg-emerald-500" />
            </span>
            NGN
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={cn("mt-4 grid gap-3", showTopUp ? "grid-cols-3" : "grid-cols-2")}>
        <Button
          type="button"
          variant={canWithdraw ? "primary" : "secondary"}
          className="min-h-12 rounded-[16px] px-2 text-xs leading-tight sm:min-h-14 sm:text-base"
          onClick={canWithdraw ? onWithdraw : () => openHref(trackHref)}
          disabled={canWithdraw ? withdrawLoading || withdrawDisabled || !onWithdraw : false}
        >
          {canWithdraw ? (
            withdrawLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minus className="h-4 w-4 sm:h-5 sm:w-5" />
          ) : (
            <PackageSearch className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
          <span className="min-w-0 text-center">{canWithdraw ? withdrawLabel : "Track my order"}</span>
        </Button>
        {showTopUp ? (
          <Button type="button" variant="secondary" className="min-h-12 rounded-[16px] px-2 text-xs leading-tight sm:min-h-14 sm:text-base" onClick={topUp} disabled={topUpLoading || Number(amount) < 500}>
            {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 sm:h-5 sm:w-5" />}
            <span className="min-w-0 text-center">Top Up</span>
          </Button>
        ) : null}
        <Button type="button" variant="secondary" className="min-h-12 rounded-[16px] px-2 text-xs leading-tight sm:min-h-14 sm:text-base" onClick={() => openHref(historyHref)}>
          <RefreshCw className="h-4 w-4" />
          <span className="min-w-0 text-center">History</span>
        </Button>
      </div>

      {message || notice ? (
        <div className="mt-4 rounded-fleet bg-fleet-gold/15 p-3 text-xs font-bold leading-5 text-amber-800">
          {message || notice}
        </div>
      ) : null}
    </section>
  );
}

function WalletIllustration() {
  return (
    <div className="pointer-events-none absolute right-3 top-1/2 z-0 h-28 w-32 -translate-y-1/2 sm:right-6 sm:h-32 sm:w-40" aria-hidden="true">
      <div className="absolute right-8 top-1 h-20 w-24 rotate-[-10deg] rounded-[18px] bg-[linear-gradient(135deg,#ffb142,#f47e18)] shadow-[0_18px_28px_rgba(0,0,0,0.28)] sm:right-10 sm:h-24 sm:w-28" />
      <div className="absolute right-0 top-6 h-24 w-28 rounded-[20px] border border-white/15 bg-[linear-gradient(135deg,#173657,#0c223f)] shadow-[0_18px_42px_rgba(0,0,0,0.35)] sm:h-28 sm:w-32">
        <WalletCards className="absolute left-5 top-8 h-9 w-9 text-white/10 sm:left-6 sm:top-10 sm:h-10 sm:w-10" />
        <div className="absolute -right-3 top-9 h-11 w-14 rounded-[15px] border border-white/15 bg-[#102a48] shadow-[0_12px_26px_rgba(0,0,0,0.28)]">
          <span className="absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-fleet-blue/70" />
        </div>
      </div>
    </div>
  );
}
