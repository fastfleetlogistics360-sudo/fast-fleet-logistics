"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Headphones, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SupportTurnstile, type SupportChallengeState } from "@/components/support/support-turnstile";
import { newSupportIdempotencyKey, supportTopics, type SupportTopicKey } from "@/lib/support/policy";

const formTopics: SupportTopicKey[] = ["delivery", "rider_kyc", "wallet", "business"];

export function SupportTicketForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<SupportChallengeState>({ ready: false, required: true, token: null, error: null });
  const [challengeReset, setChallengeReset] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState(newSupportIdempotencyKey);
  const [availability, setAvailability] = useState<{ staffed: boolean; message: string } | null>(null);
  const [form, setForm] = useState<{
    name: string;
    phone: string;
    email: string;
    topic: SupportTopicKey;
    trackingCode: string;
    body: string;
  }>({
    name: "",
    phone: "",
    email: "",
    topic: "delivery",
    trackingCode: "",
    body: ""
  });

  useEffect(() => { void fetch("/api/support/availability").then((response) => response.json()).then((result) => setAvailability(result)).catch(() => undefined); }, []);
  useEffect(() => {
    const requested = searchParams.get("topic");
    if (requested?.startsWith("delivery")) setForm((current) => ({ ...current, topic: "delivery" }));
    else if (requested === "business" || requested === "rider_kyc" || requested === "wallet") setForm((current) => ({ ...current, topic: requested }));
  }, [searchParams]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (form.body.trim().length < 6) {
      setMessage("Add a short message so support knows what to solve.");
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
          source: "form",
          topic: form.topic,
          body: form.body,
          trackingCode: form.trackingCode,
          deliveryId: searchParams.get("delivery"),
          name: form.name,
          email: form.email,
          phone: form.phone,
          idempotencyKey,
          turnstileToken: challenge.token
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Support request was rejected.");
      if (typeof result.ticketId === "string") {
        window.location.assign(`/support/cases/${result.ticketId}`);
        return;
      }
      setMessage("Support request received. Our team will respond as soon as possible.");
      setForm({ name: "", phone: "", email: "", topic: "delivery", trackingCode: "", body: "" });
      setIdempotencyKey(newSupportIdempotencyKey());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not send your request. Please try again.");
    } finally {
      setChallengeReset((value) => value + 1);
      setLoading(false);
    }
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <StatusBadge tone={availability?.staffed === false ? "amber" : "green"}>{availability?.staffed === false ? "Outside staffed hours" : "Support hours"}</StatusBadge>
          <h2 className="mt-3 text-2xl font-black text-fleet-night">Create support case</h2>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{availability?.message || "Support is staffed daily from 08:00 to 20:00 WAT. You can send a case at any time."}</p>
        </div>
        <Headphones className="h-6 w-6 text-fleet-ember" />
      </div>
      <form className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="form-field">
          <span className="form-label">Name</span>
          <input className="form-input" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Your name" />
        </label>
        <label className="form-field">
          <span className="form-label">Phone</span>
          <input className="form-input" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+234..." />
        </label>
        <label className="form-field">
          <span className="form-label">Topic</span>
          <select className="form-input" value={form.topic} onChange={(event) => update("topic", event.target.value as SupportTopicKey)}>
            {formTopics.map((topic) => <option key={topic} value={topic}>{supportTopics[topic].label}</option>)}
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">Tracking code optional</span>
          <input className="form-input" value={form.trackingCode} onChange={(event) => update("trackingCode", event.target.value)} placeholder="FF-..." />
        </label>
        <label className="form-field sm:col-span-2">
          <span className="form-label">Email</span>
          <input className="form-input" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="you@example.com" />
        </label>
        <label className="form-field sm:col-span-2">
          <span className="form-label">Message</span>
          <textarea className="form-textarea" value={form.body} onChange={(event) => update("body", event.target.value)} placeholder="How can Fast Fleets 360 help?" />
        </label>
        <div className="sm:col-span-2">
          <SupportTurnstile onChange={setChallenge} resetSignal={challengeReset} />
          {challenge.error ? <p className="mt-2 text-xs font-bold text-red-700">{challenge.error}</p> : null}
        </div>
        {message ? <div className="rounded-fleet bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800 sm:col-span-2">{message}</div> : null}
        <Link href="/support/cases" className="text-center text-sm font-black text-fleet-navy sm:col-span-2">View my support cases</Link>
        <Button className="sm:col-span-2" type="button" onClick={submit} disabled={loading || !challenge.ready || (challenge.required && !challenge.token)}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send request
        </Button>
      </form>
    </div>
  );
}
