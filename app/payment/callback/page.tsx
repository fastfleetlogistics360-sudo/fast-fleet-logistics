"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { closeSecureCheckout } from "@/lib/payments/open-secure-checkout";

export default function PaymentReturnPage() {
  return <Suspense fallback={<PaymentReturnShell />}><PaymentReturnContent /></Suspense>;
}

function PaymentReturnContent() {
  const search = useSearchParams();
  const reference = search.get("reference") || search.get("transaction_ref") || search.get("TransactionRef") || search.get("trxref") || "";
  const [error, setError] = useState("");

  useEffect(() => {
    void closeSecureCheckout();
    if (!reference) {
      setError("Missing payment reference. Open your dashboard and check the payment there.");
      return;
    }
    let stopped = false;
    async function routePayment() {
      try {
        const response = await fetch(`/api/payments/return?reference=${encodeURIComponent(reference)}`, { cache: "no-store" });
        const result = (await response.json().catch(() => ({}))) as { destination?: string; error?: string };
        if (!response.ok || !result.destination?.startsWith("/")) throw new Error(result.error || "Could not identify this payment.");
        if (!stopped) window.location.replace(result.destination);
      } catch (routeError) {
        if (!stopped) setError(routeError instanceof Error ? routeError.message : "Could not identify this payment.");
      }
    }
    void routePayment();
    return () => {
      stopped = true;
    };
  }, [reference]);

  return <PaymentReturnShell error={error} />;
}

function PaymentReturnShell({ error = "" }: { error?: string }) {
  const Icon = error ? XCircle : Loader2;
  return <section className="section-wrap grid min-h-[70vh] place-items-center py-10"><Card className="w-full max-w-xl p-7 text-center"><div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${error ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}><Icon className={`h-8 w-8 ${error ? "" : "animate-spin"}`} /></div><h1 className="mt-5 text-3xl font-black text-fleet-night">{error ? "Payment needs attention" : "Returning to Fast Fleets"}</h1><p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-7 text-slate-600">{error || "We are opening the right confirmation screen for this payment."}</p><div className="mt-7"><LinkButton href="/dashboard">Customer dashboard</LinkButton></div></Card></section>;
}
