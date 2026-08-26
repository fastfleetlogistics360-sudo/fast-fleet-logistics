"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";

export default function FastErrandCallbackPage() {
  return <Suspense fallback={<CallbackShell />}><FastErrandCallbackContent /></Suspense>;
}

function FastErrandCallbackContent() {
  const search = useSearchParams();
  const reference = search.get("reference") || search.get("transaction_ref") || "";
  const code = search.get("code") || "";
  const [state, setState] = useState<"loading" | "pending" | "success" | "error">("loading");
  const [message, setMessage] = useState("Confirming your protected purchase payment with Squad...");
  useEffect(() => {
    if (!reference) { setState("error"); setMessage("Missing payment reference."); return; }
    let stopped = false; let attempt = 0;
    const verify = async () => {
      try {
        attempt += 1;
        const response = await fetch(`/api/fast-errands/verify?reference=${encodeURIComponent(reference)}&code=${encodeURIComponent(code)}`);
        const data = await response.json();
        if (response.status === 202 && attempt < 8 && !stopped) { setState("pending"); setMessage(data.message || "Payment is still being confirmed."); window.setTimeout(verify, 5000); return; }
        if (!response.ok) throw new Error(data.error || "Payment verification failed.");
        setState("success"); setMessage("Payment confirmed. Your purchase budget is protected while Fast Fleets funds the verified vendor. A rider cannot be assigned before that step is complete.");
      } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Payment verification failed."); }
    };
    verify(); return () => { stopped = true; };
  }, [code, reference]);
  return <CallbackShell state={state} message={message} code={code} />;
}

function CallbackShell({ state = "loading", message = "Preparing payment verification...", code = "" }: { state?: "loading" | "pending" | "success" | "error"; message?: string; code?: string }) {
  const Icon = state === "success" ? CheckCircle2 : state === "error" ? XCircle : Loader2;
  return <section className="section-wrap grid min-h-[70vh] place-items-center py-10"><Card className="w-full max-w-xl p-7 text-center"><div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${state === "success" ? "bg-emerald-50 text-emerald-700" : state === "error" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}><Icon className={`h-8 w-8 ${state === "loading" || state === "pending" ? "animate-spin" : ""}`} /></div><h1 className="mt-5 text-3xl font-black text-fleet-night">{state === "success" ? "FastErrand funded" : state === "error" ? "Payment needs attention" : "Protecting your budget"}</h1><p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{message}</p>{code ? <p className="mt-3 text-xs font-bold text-slate-500">FastErrand: {code}</p> : null}<div className="mt-7 flex justify-center gap-3"><LinkButton href="/dashboard">Customer dashboard</LinkButton><LinkButton href="/fast-errands" variant="secondary">New FastErrand</LinkButton></div></Card></section>;
}
