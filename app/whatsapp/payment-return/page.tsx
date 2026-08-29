"use client";

import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";

type PaymentState =
  | { status: "loading"; message: string }
  | { status: "pending"; message: string }
  | { status: "success"; message: string; code?: string | null; whatsappUrl?: string | null }
  | { status: "error"; message: string };

export default function WhatsAppPaymentReturnPage() {
  return <Suspense fallback={<PaymentReturnShell />}><WhatsAppPaymentReturnContent /></Suspense>;
}

function WhatsAppPaymentReturnContent() {
  const [state, setState] = useState<PaymentState>({ status: "loading", message: "Confirming your payment securely..." });
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("transaction_ref") || params.get("TransactionRef") || params.get("trxref") || "";
    const token = params.get("token") || "";
    if (!reference || !token) {
      setState({ status: "error", message: "This payment return link is incomplete. Please return to WhatsApp and contact us if you were charged." });
      return;
    }
    let stopped = false;
    let attempts = 0;
    async function verify() {
      try {
        attempts += 1;
        const response = await fetch(`/api/whatsapp/payment-status?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (response.status === 202) {
          if (!stopped) {
            setState({ status: "pending", message: data.message || "Payment is still being confirmed. Please keep this page open." });
            if (attempts < 12) window.setTimeout(verify, 3500);
          }
          return;
        }
        if (!response.ok) throw new Error(data.error || "Payment confirmation failed.");
        if (!stopped) {
          setReturnUrl(typeof data.whatsappUrl === "string" ? data.whatsappUrl : null);
          setState({ status: "success", message: "Payment confirmed. Your order confirmation and delivery updates are being sent in WhatsApp now.", code: data.code, whatsappUrl: data.whatsappUrl });
        }
      } catch (error) {
        if (!stopped) setState({ status: "error", message: error instanceof Error ? error.message : "Payment confirmation failed." });
      }
    }
    verify();
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    if (state.status !== "success" || !returnUrl) return;
    const timer = window.setTimeout(() => window.location.assign(returnUrl), 1400);
    return () => window.clearTimeout(timer);
  }, [returnUrl, state.status]);

  const Icon = state.status === "success" ? CheckCircle2 : state.status === "error" ? XCircle : Loader2;
  const confirmedCode = state.status === "success" ? state.code : null;
  return (
    <section className="section-wrap grid min-h-[70vh] place-items-center py-10">
      <Card className="w-full max-w-xl p-6 text-center sm:p-8">
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${state.status === "success" ? "bg-emerald-50 text-emerald-700" : state.status === "error" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}>
          <Icon className={`h-8 w-8 ${state.status === "loading" || state.status === "pending" ? "animate-spin" : ""}`} />
        </div>
        <h1 className="mt-5 text-3xl font-black text-fleet-night">{state.status === "success" ? "Payment complete" : state.status === "pending" ? "Confirming payment" : "WhatsApp payment"}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-7 text-slate-600">{state.message}{confirmedCode ? ` Order: ${confirmedCode}.` : ""}</p>
        {state.status === "success" && returnUrl ? <LinkButton href={returnUrl} className="mt-7"><MessageCircle className="h-4 w-4" />Return to WhatsApp</LinkButton> : null}
      </Card>
    </section>
  );
}

function PaymentReturnShell() {
  return <section className="section-wrap grid min-h-[70vh] place-items-center py-10"><Card className="w-full max-w-xl p-6 text-center sm:p-8"><Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-700" /><h1 className="mt-5 text-3xl font-black text-fleet-night">WhatsApp payment</h1></Card></section>;
}
