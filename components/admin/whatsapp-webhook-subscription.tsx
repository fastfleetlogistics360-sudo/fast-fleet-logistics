"use client";

import { useState } from "react";

export function WhatsAppWebhookSubscription() {
  const [state, setState] = useState<"idle" | "working" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function subscribe() {
    setState("working");
    setMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp/subscribe", { method: "POST" });
      const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "The WhatsApp account could not be connected.");
      setState("success");
      setMessage(payload?.message || "FastFleets is now subscribed to receive WhatsApp messages.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The WhatsApp account could not be connected.");
    }
  }

  return (
    <main className="section-wrap py-10">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">WhatsApp administration</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-black text-fleet-night sm:text-5xl">Connect FastFleets to receive WhatsApp messages.</h1>
      <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
        This makes the secure Meta connection between the FastFleets WhatsApp number and the app. It does not change orders, users, dispatch, or payment settings.
      </p>
      <section className="mt-8 max-w-2xl rounded-fleet border border-fleet-line bg-white p-6">
        <button
          type="button"
          onClick={subscribe}
          disabled={state === "working" || state === "success"}
          className="rounded-full bg-fleet-ember px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "working" ? "Connecting…" : state === "success" ? "Connected" : "Connect WhatsApp account"}
        </button>
        {message ? (
          <p className={`mt-4 rounded-fleet p-4 text-sm font-bold ${state === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
