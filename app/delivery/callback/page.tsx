"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";

type VerificationState =
  | { status: "loading"; message: string }
  | { status: "pending"; message: string; deliveryCode?: string }
  | { status: "success"; message: string; amount?: number; deliveryCode?: string }
  | { status: "error"; message: string };

export default function DeliveryCallbackPage() {
  return (
    <Suspense fallback={<DeliveryCallbackShell />}>
      <DeliveryCallbackContent />
    </Suspense>
  );
}

function DeliveryCallbackContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const code = searchParams.get("code") || "";
  const deliveryId = searchParams.get("deliveryId") || "";
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), code ? `/track?code=${encodeURIComponent(code)}` : "/dashboard");
  const [state, setState] = useState<VerificationState>({
    status: "loading",
    message: "Confirming delivery payment with Paystack..."
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
        const params = new URLSearchParams({ reference: reference || "" });
        if (code) params.set("code", code);
        if (deliveryId) params.set("deliveryId", deliveryId);
        const response = await fetch(`/api/deliveries/verify?${params.toString()}`);
        const data = await response.json();
        if (response.status === 202) {
          setState({
            status: "pending",
            message: data.message || "Paystack is still confirming this payment. This page will keep checking.",
            deliveryCode: data.deliveryCode
          });
          if (!stopped && attempts < 8) {
            window.setTimeout(verify, 5000);
          }
          return;
        }
        if (!response.ok) throw new Error(data.error || "Payment verification failed.");
        setState({
          status: "success",
          message: "Payment confirmed. Online drivers are being notified now.",
          amount: data.amount,
          deliveryCode: data.deliveryCode
        });
        window.setTimeout(() => {
          window.location.assign(returnTo);
        }, 2200);
      } catch (error) {
        setState({ status: "error", message: error instanceof Error ? error.message : "Payment verification failed." });
      }
    }

    verify();
    return () => {
      stopped = true;
    };
  }, [code, deliveryId, reference, returnTo]);

  const Icon = state.status === "success" ? CheckCircle2 : state.status === "error" ? XCircle : Loader2;

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
        <h1 className="mt-5 text-3xl font-black text-fleet-night">{state.status === "success" ? "Delivery paid" : state.status === "pending" ? "Payment pending" : "Delivery payment"}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-7 text-slate-600">
          {state.message}
          {state.status === "success" && state.amount ? ` Amount: ${formatMoney(state.amount)}.` : ""}
          {(state.status === "success" || state.status === "pending") && state.deliveryCode ? ` Code: ${state.deliveryCode}.` : ""}
        </p>
        {reference ? <p className="mt-3 text-xs font-bold text-slate-500">Reference: {reference}</p> : null}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <LinkButton href={returnTo}>Track delivery</LinkButton>
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

function DeliveryCallbackShell() {
  return (
    <section className="section-wrap grid min-h-[70vh] place-items-center py-10">
      <Card className="w-full max-w-xl p-6 text-center sm:p-8">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sky-50 text-sky-700">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <h1 className="mt-5 text-3xl font-black text-fleet-night">Delivery payment</h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-7 text-slate-600">
          Preparing payment verification...
        </p>
      </Card>
    </section>
  );
}
