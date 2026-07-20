"use client";

import { useMemo, useState } from "react";
import { Headphones, Loader2, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SupportTurnstile, type SupportChallengeState } from "@/components/support/support-turnstile";
import { newSupportIdempotencyKey, supportTopics, type SupportTopicKey } from "@/lib/support/policy";

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<SupportTopicKey | null>(null);
  const [connect, setConnect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<SupportChallengeState>({ ready: false, required: true, token: null, error: null });
  const [challengeReset, setChallengeReset] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState(newSupportIdempotencyKey);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    trackingCode: "",
    body: ""
  });
  const selected = useMemo(() => (topic ? supportTopics[topic] : null), [topic]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createTicket() {
    if (!topic || form.body.trim().length < 6) {
      setMessage("Tell us a little more before connecting you to support.");
      return;
    }
    if (!challenge.ready || (challenge.required && !challenge.token)) {
      setMessage(challenge.error || "Complete the support verification before sending.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "widget",
          topic,
          body: form.body,
          trackingCode: form.trackingCode,
          name: form.name,
          email: form.email,
          phone: form.phone,
          idempotencyKey,
          turnstileToken: challenge.token
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Support request was rejected.");
      setMessage("Support request received. Our team will respond as soon as possible.");
      setConnect(false);
      setForm({ name: "", email: "", phone: "", trackingCode: "", body: "" });
      setIdempotencyKey(newSupportIdempotencyKey());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not send your request. Please try again.");
    } finally {
      setChallengeReset((value) => value + 1);
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
              {(Object.keys(supportTopics) as SupportTopicKey[]).map((item) => (
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
                  {supportTopics[item].label}
                </button>
              ))}
            </div>
            {selected ? (
              <div className="mt-4 rounded-fleet bg-fleet-paper p-3">
                <strong className="text-sm font-black text-fleet-night">Suggested solution</strong>
                <p className="mt-2 text-xs font-bold leading-5 text-slate-600">{selected.automatedReply}</p>
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
                <SupportTurnstile onChange={setChallenge} resetSignal={challengeReset} />
                {challenge.error ? <p className="text-xs font-bold text-red-700">{challenge.error}</p> : null}
                <Button type="button" onClick={createTicket} disabled={loading || !challenge.ready || (challenge.required && !challenge.token)}>
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
