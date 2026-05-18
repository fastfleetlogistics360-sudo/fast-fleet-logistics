"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";

type VerificationState =
  | { status: "loading"; message: string }
  | { status: "success"; message: string; amount?: number; balance?: number | null }
  | { status: "error"; message: string };

export default function WalletCallbackPage() {
  return (
    <Suspense fallback={<WalletCallbackShell />}>
      <WalletCallbackContent />
    </Suspense>
  );
}

function WalletCallbackContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), "/dashboard");
  const [state, setState] = useState<VerificationState>({
    status: "loading",
    message: "Confirming payment with Paystack..."
  });

  useEffect(() => {
    if (!reference) {
      setState({ status: "error", message: "Missing payment reference." });
      return;
    }

    async function verify() {
      try {
        const response = await fetch(`/api/wallet/verify?reference=${encodeURIComponent(reference || "")}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Payment verification failed.");
        setState({
          status: "success",
          message: "Wallet funded successfully. Your dashboard balance will refresh from the confirmed Paystack payment.",
          amount: data.amount,
          balance: data.balance
        });
        window.setTimeout(() => {
          window.location.assign(`${returnTo}?wallet=credited&reference=${encodeURIComponent(reference || "")}`);
        }, 2200);
      } catch (error) {
        setState({ status: "error", message: error instanceof Error ? error.message : "Payment verification failed." });
      }
    }

    verify();
  }, [reference, returnTo]);

  const Icon = state.status === "success" ? CheckCircle2 : state.status === "error" ? XCircle : Loader2;

  return (
    <section className="section-wrap grid min-h-[70vh] place-items-center py-10">
      <Card className="w-full max-w-xl p-6 text-center sm:p-8">
        <div
          className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${
            state.status === "success" ? "bg-emerald-50 text-emerald-700" : state.status === "error" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"
          }`}
        >
          <Icon className={`h-8 w-8 ${state.status === "loading" ? "animate-spin" : ""}`} />
        </div>
        <h1 className="mt-5 text-3xl font-black text-fleet-night">{state.status === "success" ? "Wallet credited" : "Wallet top-up"}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-7 text-slate-600">
          {state.message}
          {state.status === "success" && state.amount ? ` Amount: ${formatMoney(state.amount)}.` : ""}
          {state.status === "success" && typeof state.balance === "number" ? ` New balance: ${formatMoney(state.balance)}.` : ""}
        </p>
        {reference ? <p className="mt-3 text-xs font-bold text-slate-500">Reference: {reference}</p> : null}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <LinkButton href={returnTo}>Return to dashboard</LinkButton>
          <LinkButton href="/dashboard" variant="secondary">
            Customer dashboard
          </LinkButton>
        </div>
      </Card>
    </section>
  );
}

function sanitizeReturnTo(value: string | null, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.length > 120) return fallback;
  return value;
}

function WalletCallbackShell() {
  return (
    <section className="section-wrap grid min-h-[70vh] place-items-center py-10">
      <Card className="w-full max-w-xl p-6 text-center sm:p-8">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sky-50 text-sky-700">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <h1 className="mt-5 text-3xl font-black text-fleet-night">Wallet top-up</h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-7 text-slate-600">
          Preparing payment verification...
        </p>
      </Card>
    </section>
  );
}
