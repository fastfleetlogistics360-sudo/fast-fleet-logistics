"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

type ConfirmationView = {
  status?: string;
  code?: string | null;
  expiresAt?: string | null;
  sendCount?: number;
  recipientPhoneLast4?: string | null;
  smsSent?: boolean;
  error?: string;
};

export function CustomerDeliveryConfirmation({
  deliveryId,
  status,
  onConfirmed
}: {
  deliveryId: string;
  status: string;
  onConfirmed: () => void;
}) {
  const [view, setView] = useState<ConfirmationView>({ status: "loading" });
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"confirm" | "resend" | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (status !== "awaiting_delivery_confirmation") return;
    let mounted = true;
    setLoading(true);
    fetch(`/api/customer/delivery-confirmation?deliveryId=${encodeURIComponent(deliveryId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as ConfirmationView }))
      .then(({ payload }) => {
        if (mounted) setView(payload);
      })
      .catch(() => {
        if (mounted) setView({ status: "error", error: "Could not load the delivery PIN." });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [deliveryId, status]);

  useEffect(() => {
    if (!view.expiresAt) {
      setSecondsLeft(0);
      return;
    }
    function update() {
      setSecondsLeft(Math.max(0, Math.ceil((new Date(view.expiresAt || 0).getTime() - Date.now()) / 1000)));
    }
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [view.expiresAt]);

  async function submit(nextAction: "confirm" | "resend") {
    setAction(nextAction);
    try {
      const response = await fetch("/api/customer/delivery-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId, action: nextAction })
      });
      const payload = (await response.json().catch(() => ({}))) as ConfirmationView;
      if (!response.ok) throw new Error(payload.error || "Could not update delivery confirmation.");
      if (payload.status === "delivered") {
        setView({ status: "delivered" });
        onConfirmed();
        return;
      }
      setView(payload);
    } catch (error) {
      setView((current) => ({ ...current, error: error instanceof Error ? error.message : "Could not update delivery confirmation." }));
    } finally {
      setAction(null);
    }
  }

  const expired = view.status === "expired" || (Boolean(view.expiresAt) && secondsLeft <= 0);
  return (
    <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-3 shadow-[0_12px_30px_rgba(8,17,31,0.07)] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fleet-night text-white">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <span className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-fleet-ember">Secure handoff</span>
            <h3 className="mt-0.5 text-base font-black text-fleet-night">Confirm only after receiving the package</h3>
          </div>
        </div>
        <StatusBadge tone={expired ? "red" : "amber"}>{expired ? "Expired" : "Awaiting you"}</StatusBadge>
      </div>

      {loading ? <p className="mt-3 text-sm font-bold text-slate-600">Loading your delivery PIN...</p> : null}
      {!loading && view.code && !expired ? (
        <div className="mt-3 rounded-[14px] border border-amber-200 bg-white px-3 py-3 text-center">
          <span className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-slate-500">Delivery PIN</span>
          <strong className="mt-1 block font-mono text-3xl font-black tracking-[0.25em] text-fleet-night" aria-label={`Delivery PIN ${view.code.split("").join(" ")}`}>
            {view.code}
          </strong>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Expires in {formatCountdown(secondsLeft)}{view.recipientPhoneLast4 ? ` · Recipient phone ending ${view.recipientPhoneLast4}` : ""}
          </p>
        </div>
      ) : null}

      <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">
        Give this PIN to the rider only when the package is in your hands. You can also confirm the handoff directly below.
      </p>
      {view.error ? <p className="mt-2 rounded-fleet bg-red-50 p-2 text-xs font-bold text-red-700">{view.error}</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button type="button" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={Boolean(action)} onClick={() => submit("confirm")}>
          <CheckCircle2 className="h-4 w-4" />
          {action === "confirm" ? "Confirming..." : "Confirm delivery"}
        </Button>
        <Button type="button" variant="secondary" className="w-full" disabled={Boolean(action) || (!expired && Boolean(view.code) && secondsLeft > 14 * 60)} onClick={() => submit("resend")}>
          {expired ? <RefreshCw className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
          {action === "resend" ? "Requesting..." : expired ? "Request new PIN" : "Resend PIN"}
        </Button>
      </div>
    </div>
  );
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
