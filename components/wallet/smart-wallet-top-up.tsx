"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CreditCard, Loader2, Wallet, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { WalletType } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { DEFAULT_WALLET_TOP_UP_NGN, DEFAULT_WALLET_TOP_UP_POLICY, isWalletTopUpAmountAllowed, type WalletTopUpPolicy, walletTopUpRangeLabel } from "@/lib/wallet-topup-policy";

type SmartWalletTopUpProps = {
  compact?: boolean;
  className?: string;
  returnTo?: string;
  renderTrigger?: (props: { onClick: () => void; disabled: boolean }) => ReactNode;
};

export function SmartWalletTopUp({ compact = false, className, returnTo, renderTrigger }: SmartWalletTopUpProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(DEFAULT_WALLET_TOP_UP_NGN));
  const [walletType, setWalletType] = useState<Extract<WalletType, "customer" | "rider">>("customer");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [policy, setPolicy] = useState<WalletTopUpPolicy>(DEFAULT_WALLET_TOP_UP_POLICY);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const walletLabel = useMemo(() => (walletType === "rider" ? "driver earnings wallet" : "customer wallet"), [walletType]);

  useEffect(() => {
    fetch("/api/site-controls", { cache: "force-cache" })
      .then(async (response) => response.ok ? response.json() as Promise<{ wallet_policy?: { min_topup_ngn?: number; max_topup_ngn?: number } }> : null)
      .then((controls) => {
        if (!controls?.wallet_policy) return;
        const minTopUpNgn = Number(controls.wallet_policy.min_topup_ngn);
        const maxTopUpNgn = Number(controls.wallet_policy.max_topup_ngn);
        if (Number.isInteger(minTopUpNgn) && Number.isInteger(maxTopUpNgn) && minTopUpNgn > 0 && maxTopUpNgn >= minTopUpNgn) {
          setPolicy({ minTopUpNgn, maxTopUpNgn });
        }
      })
      .catch(() => undefined);
  }, []);

  async function ensureWalletAccess() {
    if (signedIn !== null) return signedIn;

    setCheckingAuth(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setSignedIn(false);
        return false;
      }

      setSignedIn(true);
      const { data: profile } = await supabase.from("users").select("role").eq("id", data.user.id).maybeSingle();
      setWalletType(profile?.role === "rider" ? "rider" : "customer");
      return true;
    } catch {
      setSignedIn(false);
      return false;
    } finally {
      setCheckingAuth(false);
    }
  }

  async function openTopUp() {
    setMessage(null);
    const hasAccess = await ensureWalletAccess();
    if (!hasAccess) {
      window.location.assign("/auth");
      return;
    }
    setOpen(true);
  }

  async function topUp() {
    const amountNgn = Number(amount);
    setMessage(null);
    if (!isWalletTopUpAmountAllowed(amountNgn, policy)) {
      setMessage(`Enter a whole-number amount between ${walletTopUpRangeLabel(policy)}.`);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNgn, walletType, returnTo: returnTo || window.location.pathname || "/dashboard" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not start Squad top-up.");
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Squad top-up.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {renderTrigger ? renderTrigger({ onClick: openTopUp, disabled: checkingAuth }) : (
        <Button type="button" variant="dark" size={compact ? "md" : "md"} className={cn(compact && "w-full", className)} onClick={openTopUp} disabled={checkingAuth}>
          {checkingAuth ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Top up wallet
        </Button>
      )}

      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-fleet-night/55 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-fleet border border-fleet-line bg-white p-5 shadow-glow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Squad wallet</span>
                <h2 className="mt-1 text-2xl font-black text-fleet-night">Wallet top up</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-600">Funds go to your {walletLabel} and are credited after server-side Squad verification.</p>
              </div>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-fleet border border-fleet-line text-fleet-night"
                aria-label="Close wallet top up"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <label className="form-field">
                <span className="form-label">Amount</span>
                <input
                  className="form-input"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  min={policy.minTopUpNgn}
                  max={policy.maxTopUpNgn}
                  placeholder={String(DEFAULT_WALLET_TOP_UP_NGN)}
                />
                <span className="mt-1 text-xs font-bold text-slate-500">{walletTopUpRangeLabel(policy)}</span>
              </label>

              <div className="grid grid-cols-2 gap-2 rounded-fleet bg-fleet-paper p-1">
                {(["customer", "rider"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={cn(
                      "min-h-10 rounded-fleet px-3 text-sm font-black capitalize transition",
                      walletType === type ? "bg-white text-fleet-night shadow-[0_8px_18px_rgba(8,17,31,0.08)]" : "text-slate-500"
                    )}
                    onClick={() => setWalletType(type)}
                  >
                    {type === "rider" ? "Driver" : "Customer"}
                  </button>
                ))}
              </div>

              {message ? <div className="rounded-fleet bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800">{message}</div> : null}

              <Button type="button" onClick={topUp} disabled={loading || !isWalletTopUpAmountAllowed(Number(amount), policy)}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Continue to Squad
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
