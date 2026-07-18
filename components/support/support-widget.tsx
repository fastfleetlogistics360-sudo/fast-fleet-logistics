"use client";

import { useMemo, useState } from "react";
import { Headphones, Loader2, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

type SupportTopic = "delivery" | "rider_kyc" | "wallet" | "business" | "other";

const topicCopy: Record<SupportTopic, { label: string; subject: string; answer: string; priority: "normal" | "high" | "urgent" }> = {
  delivery: {
    label: "Delivery order",
    subject: "Delivery support request",
    answer: "Check your tracking page first. If the rider is delayed, keep the delivery code ready so support can inspect pickup, route, and timeline events quickly.",
    priority: "high"
  },
  rider_kyc: {
    label: "Driver KYC",
    subject: "Driver KYC support request",
    answer: "Most KYC delays come from unclear ID photos, missing vehicle papers, or bank details. Re-upload the correct document in Driver KYC, then ask support to review it.",
    priority: "normal"
  },
  wallet: {
    label: "Wallet/payment",
    subject: "Wallet or payment support request",
    answer: "Keep the payment reference for any debit. Support can use it to review a pending wallet credit.",
    priority: "urgent"
  },
  business: {
    label: "Business account",
    subject: "Business account support request",
    answer: "Business setup issues are usually profile, pickup address, or team access related. Confirm your business profile is submitted before requesting manual support.",
    priority: "normal"
  },
  other: {
    label: "Something else",
    subject: "General support request",
    answer: "Share the account email or phone, what you expected to happen, and what actually happened. Support can route the issue from there.",
    priority: "normal"
  }
};

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [connect, setConnect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    trackingCode: "",
    body: ""
  });
  const selected = useMemo(() => (topic ? topicCopy[topic] : null), [topic]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createTicket() {
    if (!topic || form.body.trim().length < 6) {
      setMessage("Tell us a little more before connecting you to support.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "widget",
          topic,
          subject: selected?.subject,
          body: form.body,
          trackingCode: form.trackingCode,
          name: form.name,
          email: form.email,
          phone: form.phone,
          priority: selected?.priority || "normal",
          automatedReply: selected?.answer
        })
      });
      if (!response.ok) throw new Error("Support request was rejected.");
      setMessage("Support request received. Our team will respond as soon as possible.");
      setConnect(false);
      setForm({ name: "", email: "", phone: "", trackingCode: "", body: "" });
    } catch {
      try {
        window.localStorage.setItem(
          "fastfleet.pending_support_ticket",
          JSON.stringify({ topic, form, created_at: new Date().toISOString() })
        );
      } catch {
        // Ignore storage errors; the visible message is enough.
      }
      setMessage("We could not send your request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-20 right-4 z-[70] sm:bottom-6">
      {open ? (
        <div className="mb-3 w-[calc(100vw-32px)] max-w-sm overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_24px_70px_rgba(8,17,31,0.24)]">
          <div className="flex items-center justify-between gap-3 border-b border-fleet-line bg-fleet-night px-4 py-3 text-white">
            <span className="flex items-center gap-2 text-sm font-black">
              <Headphones className="h-4 w-4" />
              Fast Fleets 360 support
            </span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-full bg-white/10" onClick={() => setOpen(false)} aria-label="Close support chat">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <StatusBadge tone="green">Auto help first</StatusBadge>
            <p className="mt-3 text-sm font-bold leading-6 text-slate-600">Pick the problem. I’ll suggest the fastest fix first, then connect you to a representative if needed.</p>
            <div className="mt-4 grid gap-2">
              {(Object.keys(topicCopy) as SupportTopic[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setTopic(item);
                    setConnect(false);
                    setMessage(null);
                  }}
                  className={`rounded-fleet border px-3 py-2 text-left text-sm font-black transition ${
                    topic === item ? "border-fleet-ember bg-orange-50 text-fleet-night" : "border-fleet-line bg-white text-slate-600"
                  }`}
                >
                  {topicCopy[item].label}
                </button>
              ))}
            </div>
            {selected ? (
              <div className="mt-4 rounded-fleet bg-fleet-paper p-3">
                <strong className="text-sm font-black text-fleet-night">Suggested solution</strong>
                <p className="mt-2 text-xs font-bold leading-5 text-slate-600">{selected.answer}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setMessage("Glad that helped. Support is still here if you need it.")}>
                    Solved
                  </Button>
                  <Button type="button" size="sm" onClick={() => setConnect(true)}>
                    Representative
                  </Button>
                </div>
              </div>
            ) : null}
            {connect ? (
              <div className="mt-4 grid gap-3">
                <input className="form-input" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Name" />
                <input className="form-input" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="Email" inputMode="email" />
                <input className="form-input" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="Phone" inputMode="tel" />
                <input className="form-input" value={form.trackingCode} onChange={(event) => update("trackingCode", event.target.value)} placeholder="Tracking code, if any" />
                <textarea className="form-textarea" value={form.body} onChange={(event) => update("body", event.target.value)} placeholder="Tell the representative what happened" />
                <Button type="button" onClick={createTicket} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Connect to representative
                </Button>
              </div>
            ) : null}
            {message ? <div className="mt-4 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{message}</div> : null}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="grid h-12 w-12 place-items-center rounded-full bg-fleet-ember text-white shadow-[0_18px_45px_rgba(239,108,0,0.32)] transition hover:-translate-y-0.5"
        aria-label="Open support chat"
      >
        <MessageCircle className="h-5 w-5" />
      </button>
    </div>
  );
}
