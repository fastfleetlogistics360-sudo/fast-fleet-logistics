"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { accountTrackingHref } from "@/lib/tracking-links";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";

type VerificationState =
  | { status: "loading"; message: string }
  | { status: "pending"; message: string }
  | { status: "success"; message: string; amount?: number; orderCode?: string; deliveryCode?: string }
  | { status: "error"; message: string };

export default function MarketplaceCallbackPage() {
  return (
    <Suspense fallback={<MarketplaceCallbackShell />}>
      <MarketplaceCallbackContent />
    </Suspense>
  );
}

function MarketplaceCallbackContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("transaction_ref") || searchParams.get("TransactionRef") || searchParams.get("trxref");
  const code = searchParams.get("code") || reference || "";
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), code ? accountTrackingHref(code) : "/dashboard");
  const [state, setState] = useState<VerificationState>({
    status: "loading",
    message: "Confirming marketplace payment with Squad..."
  });

  useEffect(() => {
    if (!reference) {
      setState({ status: "error", message: "Missing payment reference." });
      return;
    }

    let stopped = false;
    let attempts = 0;

    async function verify() {
      try {
        attempts += 1;
        const response = await fetch(`/api/marketplace/verify?reference=${encodeURIComponent(reference || "")}`);
        const data = await response.json();
        if (response.status === 202) {
          setState({ status: "pending", message: data.message || "Squad is still confirming this payment." });
          if (!stopped && attempts < 8) window.setTimeout(verify, 5000);
          return;
        }
        if (!response.ok) throw new Error(data.error || "Marketplace payment verification failed.");
        setState({
          status: "success",
          message: data.kind === "business_order" ? "Payment confirmed. The business wallet has been credited." : "Payment confirmed. Fast Fleets 360 is preparing tracking.",
          amount: data.amount,
          orderCode: data.orderCode,
          deliveryCode: data.deliveryCode
        });
        window.setTimeout(() => {
          window.location.assign(returnWithPaymentParams(returnTo, reference || "", code));
        }, 2200);
      } catch (error) {
        setState({ status: "error", message: error instanceof Error ? error.message : "Marketplace payment verification failed." });
      }
    }

    verify();
    return () => {
      stopped = true;
    };
  }, [code, reference, returnTo]);

  const Icon = state.status === "success" ? CheckCircle2 : state.status === "error" ? XCircle : Loader2;
  const codeLabel = state.status === "success" ? state.orderCode || state.deliveryCode : null;

  return (
    <section className="section-wrap grid min-h-[70vh] place-items-center py-10">
      <Card className="w-full max-w-xl p-6 text-center sm:p-8">
        <div
          className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${
            state.status === "success" ? "bg-emerald-50 text-emerald-700" : state.status === "error" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"
          }`}
        >
          <Icon className={`h-8 w-8 ${state.status === "loading" || state.status === "pending" ? "animate-spin" : ""}`} />
        </div>
        <h1 className="mt-5 text-3xl font-black text-fleet-night">{state.status === "success" ? "Marketplace paid" : state.status === "pending" ? "Payment pending" : "Marketplace payment"}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-7 text-slate-600">
          {state.message}
          {state.status === "success" && state.amount ? ` Amount: ${formatMoney(state.amount)}.` : ""}
          {codeLabel ? ` Code: ${codeLabel}.` : ""}
        </p>
        {reference ? <p className="mt-3 text-xs font-bold text-slate-500">Reference: {reference}</p> : null}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <LinkButton href={returnTo}>Track order</LinkButton>
          <LinkButton href="/dashboard" variant="secondary">
            Customer dashboard
          </LinkButton>
        </div>
      </Card>
    </section>
  );
}

function sanitizeReturnTo(value: string | null, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.length > 160) return fallback;
  return value;
}

function returnWithPaymentParams(returnTo: string, reference: string, code: string) {
  const url = new URL(returnTo, window.location.origin);
  url.searchParams.set("paid", "1");
  url.searchParams.set("reference", reference);
  if (code) url.searchParams.set("code", code);
  return `${url.pathname}${url.search}${url.hash}`;
}

function MarketplaceCallbackShell() {
  return (
    <section className="section-wrap grid min-h-[70vh] place-items-center py-10">
      <Card className="w-full max-w-xl p-6 text-center sm:p-8">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sky-50 text-sky-700">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <h1 className="mt-5 text-3xl font-black text-fleet-night">Marketplace payment</h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-7 text-slate-600">
          Preparing payment verification...
        </p>
      </Card>
    </section>
  );
}
