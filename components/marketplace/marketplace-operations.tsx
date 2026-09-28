"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ClipboardList, Loader2, RefreshCw, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type Branch = { id: string; legacy_branch_key: string; state?: string | null; operational_area?: string | null; pickup_address?: string | null; operational_status: string };
type Vendor = { id: string; display_name: string; source_kind: string; marketplace_category?: string | null; operational_mode: string; lifecycle_status: string; linked_business_profile_id?: string | null; attention_count: number; active_order_count: number; branches: Branch[] };
type Order = { id: string; order_code?: string | null; status: string; payment_status?: string | null; amount?: number | null; items?: Array<{ name?: string; productName?: string; quantity?: number }> | null; customer_contact?: string | null; pickup_address?: string | null; dropoff_address?: string | null; delivery_id?: string | null; marketplace_vendor_branch_id?: string | null; created_at?: string | null };
type Payload = { role: string; vendors: Vendor[]; orders: Order[]; attention_count: number; all_order_count: number; attention_definition: string; pagination: { page: number; page_size: number; total: number } };

const filters = [["attention", "Needs attention"], ["pending", "New / paid"], ["received", "Received"], ["preparing", "Preparing"], ["packing", "Packing"], ["ready_for_pickup", "Ready for pickup"], ["all", "All"]] as const;

export function MarketplaceOperations({ vendorId }: { vendorId?: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [filter, setFilter] = useState("attention");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const selectedVendor = useMemo(() => payload?.vendors.find((vendor) => vendor.id === vendorId) || null, [payload, vendorId]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const parameters = new URLSearchParams({ status: filter, page: String(page) });
    if (vendorId) parameters.set("vendor", vendorId);
    if (search.trim()) parameters.set("q", search.trim());
    try {
      const response = await fetch(`/api/marketplace/operations?${parameters}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load Marketplace Operations.");
      setPayload(result as Payload); setMessage(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load Marketplace Operations."); }
    finally { if (!silent) setLoading(false); }
  }, [filter, page, search, vendorId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const supabase = createClient();
    // RLS continues to deny browser writes. When the existing deployment has
    // read-enabled Realtime for these tables, a canonical order/delivery event
    // invalidates this bounded server query; no polling is introduced.
    const channel = supabase.channel(`marketplace-operations:${vendorId || "landing"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => void load(true))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, vendorId]);

  async function transition(orderId: string, status: string) {
    setBusy(`${orderId}:${status}`); setMessage(null);
    try {
      const response = await fetch(`/api/marketplace/operations/orders/${orderId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not update this order.");
      await load(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update this order."); }
    finally { setBusy(null); }
  }

  if (loading && !payload) return <main className="section-wrap py-10"><Card className="grid min-h-48 place-items-center p-6"><Loader2 className="h-6 w-6 animate-spin text-fleet-navy" /></Card></main>;
  if (!payload) return <main className="section-wrap py-10"><Card className="p-6"><h1 className="text-xl font-black text-fleet-night">Marketplace Operations unavailable</h1><p className="mt-2 text-sm font-semibold text-slate-600">{message || "Please try again."}</p></Card></main>;

  return <main className="section-wrap py-6 sm:py-10">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        {vendorId ? <Link href="/marketplace/operations" className="inline-flex items-center gap-1 text-sm font-black text-fleet-navy"><ChevronLeft className="h-4 w-4" />All managed vendors</Link> : null}
        <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Internal workspace · {payload.role}</p>
        <h1 className="mt-1 text-2xl font-black text-fleet-night sm:text-3xl">{selectedVendor ? selectedVendor.display_name : "Marketplace Operations"}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">{selectedVendor ? "Manage this vendor’s canonical Marketplace orders." : "Managed vendors and orders requiring a legitimate next action."}</p>
      </div>
      <Button type="button" variant="secondary" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Button>
    </div>
    {message ? <div role="alert" className="mt-5 flex gap-2 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800"><AlertCircle className="h-5 w-5 shrink-0" />{message}</div> : null}
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <Metric label="Needs attention" value={payload.attention_count} detail="Verified paid workflow" />
      <Metric label="All orders" value={payload.all_order_count} detail="Within your access scope" />
      <Metric label="Managed vendors" value={payload.vendors.length} detail="Canonical orders only" />
    </div>
    {vendorId ? <VendorWorkspace vendor={selectedVendor} orders={payload.orders} filter={filter} onFilter={(value) => { setFilter(value); setPage(0); }} search={search} onSearch={(value) => { setSearch(value); setPage(0); }} busy={busy} onTransition={transition} page={payload.pagination.page} total={payload.pagination.total} pageSize={payload.pagination.page_size} onPage={setPage} /> : <><VendorList vendors={payload.vendors} /><GlobalQueue orders={payload.orders} busy={busy} onTransition={transition} /></>}
    <p className="mt-5 text-xs font-semibold text-slate-500">{payload.attention_definition}</p>
  </main>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <Card className="p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><strong className="mt-2 block text-2xl font-black text-fleet-night">{value}</strong><p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p></Card>; }
function VendorList({ vendors }: { vendors: Vendor[] }) { return <section className="mt-6"><div className="flex items-center gap-2"><Store className="h-5 w-5 text-fleet-navy" /><h2 className="text-xl font-black text-fleet-night">Managed vendors</h2></div><div className="mt-3 grid gap-3 md:grid-cols-2">{vendors.map((vendor) => <Link key={vendor.id} href={`/marketplace/operations/${vendor.id}`} className="rounded-fleet border border-fleet-line bg-white p-4 transition hover:border-fleet-gold"><div className="flex justify-between gap-3"><div><h3 className="font-black text-fleet-night">{vendor.display_name}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{vendor.source_kind} · {vendor.branches.map((branch) => branch.state || branch.operational_area).filter(Boolean).join(", ") || "Branch not configured"}</p></div><AttentionBadge count={vendor.attention_count} /></div><div className="mt-4 flex flex-wrap gap-2"><StatusBadge tone="blue">Fast Fleets managed</StatusBadge><StatusBadge tone={vendor.lifecycle_status === "active" ? "green" : "amber"}>{vendor.lifecycle_status}</StatusBadge><span className="text-xs font-bold text-slate-500">{vendor.active_order_count} active orders</span></div></Link>)}</div>{!vendors.length ? <Card className="mt-3 p-5 text-sm font-bold text-slate-600">No managed vendors are currently within your assigned scope.</Card> : null}</section>; }
function GlobalQueue({ orders, busy, onTransition }: { orders: Order[]; busy: string | null; onTransition: (id: string, status: string) => void }) { return <section className="mt-6"><div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-fleet-navy" /><h2 className="text-xl font-black text-fleet-night">Needs attention</h2></div><p className="mt-1 text-sm font-semibold text-slate-500">The first page of verified paid orders awaiting a workflow action.</p><div className="mt-3 grid gap-3">{orders.map((order) => <OrderCard key={order.id} order={order} busy={busy} onTransition={onTransition} />)}{!orders.length ? <Card className="p-5 text-sm font-bold text-slate-600">No verified paid orders currently need action.</Card> : null}</div></section>; }
function VendorWorkspace({ vendor, orders, filter, onFilter, search, onSearch, busy, onTransition, page, total, pageSize, onPage }: { vendor: Vendor | null; orders: Order[]; filter: string; onFilter: (value: string) => void; search: string; onSearch: (value: string) => void; busy: string | null; onTransition: (id: string, status: string) => void; page: number; total: number; pageSize: number; onPage: (page: number) => void }) { if (!vendor) return <Card className="mt-6 p-5">This vendor is not available in your scope.</Card>; return <section className="mt-6"><Card className="p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm font-black text-fleet-night">{vendor.branches.length} branch{vendor.branches.length === 1 ? "" : "es"}</p><p className="mt-1 text-xs font-semibold text-slate-500">{vendor.branches.map((branch) => `${branch.state || branch.operational_area || branch.legacy_branch_key} · ${branch.operational_status}`).join("  •  ")}</p></div><AttentionBadge count={vendor.attention_count} /></div></Card><div className="mt-4 flex flex-wrap gap-2">{filters.map(([value, label]) => <button key={value} type="button" onClick={() => onFilter(value)} className={`min-h-10 rounded-full px-3 text-sm font-black ${filter === value ? "bg-fleet-navy text-white" : "bg-white text-slate-600"}`}>{label}</button>)}</div><label className="mt-4 block"><span className="sr-only">Search by order reference</span><input className="form-input" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search order reference" /></label><div className="mt-4 grid gap-3">{orders.map((order) => <OrderCard key={order.id} order={order} busy={busy} onTransition={onTransition} />)}{!orders.length ? <Card className="p-5 text-sm font-bold text-slate-600">No orders match this filter.</Card> : null}</div>{total > pageSize ? <div className="mt-4 flex justify-between"><Button type="button" variant="secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Button><span className="self-center text-sm font-bold text-slate-600">{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}</span><Button type="button" variant="secondary" disabled={(page + 1) * pageSize >= total} onClick={() => onPage(page + 1)}>Next</Button></div> : null}</section>; }
function OrderCard({ order, busy, onTransition }: { order: Order; busy: string | null; onTransition: (id: string, status: string) => void }) { const actions = ["received", "preparing", "packing", "ready_for_pickup"]; const current = actions.indexOf(order.status); const paid = order.payment_status === "paid"; return <Card className="p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-fleet-night">{order.order_code || order.id}</h3><StatusBadge tone={paid ? "green" : "amber"}>{order.payment_status || "payment unknown"}</StatusBadge><StatusBadge tone="blue">{order.status.replaceAll("_", " ")}</StatusBadge></div><p className="mt-2 text-xs font-semibold text-slate-500">{formatDateTime(order.created_at || "")} · {formatMoney(Number(order.amount || 0))}</p><p className="mt-2 text-sm font-semibold text-slate-700">{(order.items || []).slice(0, 3).map((item) => `${item.name || item.productName || "Item"} ×${item.quantity || 1}`).join(", ") || "Marketplace items"}</p><p className="mt-1 text-xs font-semibold text-slate-500">Pickup: {order.pickup_address || "Vendor branch"}</p></div><ClipboardList className="h-6 w-6 shrink-0 text-fleet-navy" /></div><div className="mt-4 grid gap-2 sm:grid-cols-4">{actions.map((status, index) => <Button key={status} type="button" size="sm" variant={order.status === status ? "primary" : "secondary"} disabled={!paid || current > index || busy === `${order.id}:${status}`} onClick={() => onTransition(order.id, status)}>{busy === `${order.id}:${status}` ? "Updating..." : status.replaceAll("_", " ")}</Button>)}</div>{!paid ? <p className="mt-2 text-xs font-bold text-amber-700">Preparation is unavailable until payment is verified.</p> : null}</Card>; }
function AttentionBadge({ count }: { count: number }) { return <span aria-label={`${count} orders need attention`} className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-red-100 px-2 text-sm font-black text-red-800">{count}<span className="sr-only"> orders need attention</span></span>; }
