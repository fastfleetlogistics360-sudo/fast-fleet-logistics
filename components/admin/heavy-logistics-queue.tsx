"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardList, Loader2, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/lib/format";

type Request = {
  id: string;
  request_code: string;
  category: string;
  item_type: string;
  quantity: string;
  pickup_address: string;
  pickup_access: string;
  dropoff_address: string;
  dropoff_access: string;
  contact_name: string;
  contact_phone: string;
  preferred_pickup_at: string | null;
  instructions: string | null;
  status: string;
  quoted_price_ngn: number | null;
  internal_notes: string | null;
  created_at: string;
  users?: { full_name?: string | null; phone?: string | null; email?: string | null } | null;
};

const statuses = ["submitted", "under_review", "quoted", "scheduled", "vehicle_assigned", "in_transit", "completed", "cancelled"];

export function HeavyLogisticsQueue() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { status: string; quotedPrice: string; internalNotes: string }>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/heavy-logistics", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load requests.");
      const next = Array.isArray(result.requests) ? result.requests : [];
      setRequests(next);
      setDrafts(Object.fromEntries(next.map((item: Request) => [item.id, { status: item.status, quotedPrice: item.quoted_price_ngn?.toString() || "", internalNotes: item.internal_notes || "" }])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function change(id: string, patch: Partial<{ status: string; quotedPrice: string; internalNotes: string }>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || { status: "submitted", quotedPrice: "", internalNotes: "" }), ...patch } }));
  }

  async function save(item: Request) {
    const draft = drafts[item.id];
    if (!draft) return;
    setSaving(item.id);
    setError(null);
    try {
      const response = await fetch("/api/admin/heavy-logistics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, ...draft })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not update request.");
      setRequests((current) => current.map((request) => request.id === item.id ? { ...request, status: result.request.status, quoted_price_ngn: result.request.quoted_price_ngn, internal_notes: draft.internalNotes } : request));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update request.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,126,24,0.08),transparent_30%),linear-gradient(180deg,#f8fafc,#eef3f8)] pb-10 text-fleet-night">
      <section className="section-wrap py-5 sm:py-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-[14px] bg-fleet-night text-white"><ClipboardList className="h-5 w-5" /></span><h1 className="text-2xl font-black sm:text-3xl">Heavy Logistics Queue</h1></div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
        </div>
        {error ? <div className="mt-4 rounded-fleet border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div> : null}
        {loading ? <Card className="mt-5 grid min-h-48 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-fleet-ember" /></Card> : null}
        <div className="mt-5 grid gap-4">
          {requests.map((item) => <QueueCard key={item.id} item={item} draft={drafts[item.id]} saving={saving === item.id} onChange={(patch) => change(item.id, patch)} onSave={() => void save(item)} />)}
          {!loading && requests.length === 0 ? <Card className="p-6 text-sm font-black text-slate-500">No requests.</Card> : null}
        </div>
      </section>
    </main>
  );
}

function QueueCard({ item, draft, saving, onChange, onSave }: { item: Request; draft?: { status: string; quotedPrice: string; internalNotes: string }; saving: boolean; onChange: (patch: Partial<{ status: string; quotedPrice: string; internalNotes: string }>) => void; onSave: () => void }) {
  const phone = item.contact_phone.replace(/\D/g, "");
  const selectedStatus = draft?.status || item.status;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><strong className="text-lg font-black">{item.request_code}</strong><span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-black text-fleet-ember">{label(item.status)}</span></div>
          <p className="mt-2 text-sm font-black text-fleet-night">{label(item.category)} · {item.item_type} · {item.quantity}</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">{item.pickup_address} → {item.dropoff_address}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Pickup: {label(item.pickup_access)} · Delivery: {label(item.dropoff_access)} · {item.preferred_pickup_at ? formatDateTime(item.preferred_pickup_at) : ""}</p>
          <p className="mt-2 text-sm font-bold text-slate-600">{item.contact_name} · {item.contact_phone}</p>
          {item.instructions ? <p className="mt-2 rounded-fleet bg-fleet-paper p-3 text-sm font-semibold text-slate-600">{item.instructions}</p> : null}
        </div>
        <div className="flex gap-2"><a href={`tel:${item.contact_phone}`} className="inline-flex h-10 items-center justify-center rounded-[14px] border border-fleet-line bg-white px-3 text-fleet-night transition hover:border-fleet-gold"><Phone className="h-4 w-4" /></a><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-[14px] border border-fleet-line bg-white px-3 text-emerald-700 transition hover:border-emerald-400"><MessageCircle className="h-4 w-4" /></a></div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_1fr_auto]">
        <label className="form-field"><span className="form-label">Status</span><select className="form-input" value={selectedStatus} onChange={(event) => onChange({ status: event.target.value })}>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
        <label className="form-field"><span className="form-label">Quote</span><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">₦</span><input className="form-input pl-8" type="number" min="0" value={draft?.quotedPrice || ""} onChange={(event) => onChange({ quotedPrice: event.target.value })} placeholder="0" /></div></label>
        <label className="form-field"><span className="form-label">Internal notes</span><input className="form-input" value={draft?.internalNotes || ""} onChange={(event) => onChange({ internalNotes: event.target.value })} maxLength={1500} /></label>
        <Button type="button" className="self-end" onClick={onSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</Button>
      </div>
      {item.quoted_price_ngn !== null ? <span className="mt-3 inline-block text-sm font-black text-emerald-700">{formatMoney(item.quoted_price_ngn)}</span> : null}
    </Card>
  );
}

function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
