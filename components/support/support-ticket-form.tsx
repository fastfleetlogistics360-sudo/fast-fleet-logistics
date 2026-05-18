"use client";

import { useState } from "react";
import { Headphones, Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("support_tickets").insert({
        user_id: user?.id,
        contact_name: form.name.trim() || user?.user_metadata?.full_name || null,
        contact_email: form.email.trim() || user?.email || null,
        contact_phone: form.phone.trim() || user?.phone || null,
        topic: form.topic,
        subject: `${form.topic} support`,
        message: `${form.body.trim()}${form.trackingCode.trim() ? `\nTracking code: ${form.trackingCode.trim()}` : ""}`,
        priority: form.topic === "Wallet and payments" ? "urgent" : "normal",
        status: "open"
      });
      if (error) throw error;
      setMessage("Support ticket sent. It will appear in the admin support queue.");
      setForm({ name: "", phone: "", email: "", topic: "Delivery order", trackingCode: "", body: "" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send ticket. Check Supabase connection.");
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
          <textarea className="form-textarea" value={form.body} onChange={(event) => update("body", event.target.value)} placeholder="How can FastFleet help?" />
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
