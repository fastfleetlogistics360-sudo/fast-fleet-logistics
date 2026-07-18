"use client";

import { useState } from "react";
import { Headphones, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

export function SupportTicketForm() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    topic: "Delivery order",
    trackingCode: "",
    body: ""
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (form.body.trim().length < 6) {
      setMessage("Add a short message so support knows what to solve.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: form.topic,
          subject: `${form.topic} support`,
          body: form.body,
          trackingCode: form.trackingCode,
          name: form.name,
          email: form.email,
          phone: form.phone,
          priority: form.topic === "Wallet and payments" ? "urgent" : "normal"
        })
      });
      if (!response.ok) throw new Error("Support request was rejected.");
      setMessage("Support request received. Our team will respond as soon as possible.");
      setForm({ name: "", phone: "", email: "", topic: "Delivery order", trackingCode: "", body: "" });
    } catch {
      setMessage("We could not send your request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <StatusBadge tone="green">Online</StatusBadge>
          <h2 className="mt-3 text-2xl font-black text-fleet-night">Create support ticket</h2>
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
          <select className="form-input" value={form.topic} onChange={(event) => update("topic", event.target.value)}>
            <option>Delivery order</option>
            <option>Rider application</option>
            <option>Wallet and payments</option>
            <option>Business dispatch</option>
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
        {message ? <div className="rounded-fleet bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800 sm:col-span-2">{message}</div> : null}
        <Button className="sm:col-span-2" type="button" onClick={submit} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send request
        </Button>
      </form>
    </div>
  );
}
