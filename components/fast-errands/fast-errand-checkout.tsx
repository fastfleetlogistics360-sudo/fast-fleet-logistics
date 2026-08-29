"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, PackageCheck, Plus, Search, ShoppingCart, WalletCards } from "lucide-react";
import { AddressAutocompleteInput } from "@/components/location/address-autocomplete-input";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format";
import type { FastErrandsCatalogItem, FastErrandsCategory } from "@/lib/fast-errands-catalog";

type CartItem = FastErrandsCatalogItem & { category: string; quantity: number };

export function FastErrandCheckout({ catalog, fulfilmentConfigured }: { catalog: FastErrandsCategory[]; fulfilmentConfigured: boolean }) {
  const [activeCategoryId, setActiveCategoryId] = useState(catalog[0]?.id || "");
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [customRequest, setCustomRequest] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeErrands, setActiveErrands] = useState<Array<{ id: string; errand_code: string; vendor_name: string; status: string; top_up_required_ngn: number }>>([]);
  const activeCategory = catalog.find((category) => category.id === activeCategoryId) || catalog[0] || null;
  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const itemTotal = useMemo(() => cartItems.reduce((total, item) => total + Number(item.price_ngn) * item.quantity, 0), [cartItems]);
  const itemCount = useMemo(() => cartItems.reduce((count, item) => count + item.quantity, 0), [cartItems]);

  useEffect(() => {
    fetch("/api/fast-errands", { cache: "no-store" }).then((response) => response.ok ? response.json() : { errands: [] }).then((data) => setActiveErrands(Array.isArray(data.errands) ? data.errands : [])).catch(() => undefined);
  }, []);

  function changeQuantity(item: FastErrandsCatalogItem, delta: number) {
    setCart((current) => {
      const quantity = Math.max(0, (current[item.id]?.quantity || 0) + delta);
      const next = { ...current };
      if (!quantity) delete next[item.id];
      else next[item.id] = { ...item, category: activeCategory?.name || "FastErrand", quantity };
      return next;
    });
  }

  async function payTopUp(errandId: string) {
    setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/fast-errands/top-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ errandId }) });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || "Could not start the top-up.");
      window.location.assign(data.authorizationUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start the top-up."); setLoading(false); }
  }

  async function checkout() {
    setMessage(null);
    if (!fulfilmentConfigured) { setMessage("FastErrands is not available yet. Ask an administrator to attach the fulfilment business account."); return; }
    if (!cartItems.length) { setMessage("Add at least one FastErrand item before checking out."); return; }
    if (!email.trim() || address.trim().length < 6) { setMessage("Enter your receipt email and delivery address before checking out."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/fast-errands/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cartItems.map((item) => ({ itemId: item.id, quantity: item.quantity })), note: customRequest, address, email, phone }) });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || "Could not start FastErrands payment.");
      window.location.assign(data.authorizationUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start FastErrands payment."); } finally { setLoading(false); }
  }

  return <>
    <BackButton className="section-wrap pb-4 pt-4" />
    <section className="section-wrap pb-12 pt-2">
      <div className="overflow-hidden rounded-[24px] border border-fleet-line bg-white shadow-lift"><div className="grid md:grid-cols-[300px_1fr]"><div className="relative min-h-48 bg-fleet-night"><span className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(244,126,24,0.55),_transparent_45%)]" /><span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-black uppercase tracking-[0.13em] text-fleet-ember"><WalletCards className="h-4 w-4" /> FastErrands</span><div className="absolute bottom-5 left-5 right-5 text-white"><PackageCheck className="h-9 w-9 text-orange-300" /><p className="mt-3 text-lg font-black leading-tight">Need something? We&apos;ll get it for you.</p></div></div><div className="p-5 sm:p-7"><span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Priced everyday essentials</span><h1 className="mt-2 max-w-2xl text-3xl font-black leading-tight text-fleet-night sm:text-4xl">Build one FastErrand across the things you need.</h1><p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-600">Choose items from any category, review their exact prices in one cart, then check out securely. Your FastErrand is prepared through our fulfilment account and released to a rider after payment.</p><div className="mt-5 flex flex-wrap gap-2"><StatusBadge tone="green">Item prices shown before checkout</StatusBadge><StatusBadge tone="neutral">One combined FastErrand</StatusBadge></div></div></div></div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0"><Card className="p-4 sm:p-5"><span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Choose a category</span><div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">{catalog.map((category) => <button key={category.id} type="button" onClick={() => setActiveCategoryId(category.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-black transition ${category.id === activeCategory?.id ? "bg-fleet-ember text-white shadow-[0_12px_26px_rgba(244,126,24,0.20)]" : "bg-fleet-paper text-fleet-night hover:bg-white hover:shadow-[0_10px_24px_rgba(8,17,31,0.08)]"}`}><span>{category.emoji}</span>{category.name}</button>)}</div></Card>
        {activeCategory ? <div className="mt-5 rounded-fleet border border-fleet-line bg-white p-4 shadow-[0_10px_24px_rgba(8,17,31,0.06)] sm:p-5"><div className="flex items-start justify-between gap-4"><div><span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">{activeCategory.name}</span><h2 className="mt-1 text-2xl font-black text-fleet-night">{activeCategory.emoji} {activeCategory.name}</h2><p className="mt-1 text-sm font-semibold text-slate-600">{activeCategory.description}</p></div><StatusBadge tone="green">{activeCategory.items.length} items</StatusBadge></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{activeCategory.items.map((item) => { const quantity = cart[item.id]?.quantity || 0; return <article key={item.id} className="rounded-fleet border border-fleet-line bg-fleet-paper p-4"><div className="flex gap-3"><div className="min-w-0 flex-1"><strong className="block text-base font-black text-fleet-night">{item.name}</strong>{item.description ? <span className="mt-1 block text-xs font-bold text-slate-500">{item.description}</span> : null}<span className="mt-3 block text-lg font-black text-fleet-night">{formatMoney(item.price_ngn)}</span></div><div className="flex shrink-0 items-end gap-2"><button type="button" aria-label={`Remove ${item.name}`} onClick={() => changeQuantity(item, -1)} disabled={!quantity} className="grid h-9 w-9 place-items-center rounded-full border border-fleet-line bg-white text-fleet-night disabled:cursor-not-allowed disabled:opacity-40"><Minus className="h-4 w-4" /></button><span className="grid h-9 min-w-7 place-items-center text-sm font-black text-fleet-night">{quantity}</span><button type="button" aria-label={`Add ${item.name}`} onClick={() => changeQuantity(item, 1)} className="grid h-9 w-9 place-items-center rounded-full bg-fleet-night text-white"><Plus className="h-4 w-4" /></button></div></div></article>; })}</div></div> : <Card className="mt-5 p-5"><h2 className="text-xl font-black text-fleet-night">FastErrands is being stocked</h2><p className="mt-2 text-sm font-semibold text-slate-600">Check back shortly while the FastErrands catalogue is prepared.</p></Card>}
        <Card className="mt-5 p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-fleet bg-orange-50 text-fleet-ember"><Search className="h-5 w-5" /></span><div><h2 className="font-black text-fleet-night">Can&apos;t find what you need?</h2><p className="text-xs font-bold text-slate-500">Add a note for the fulfilment team to review with your order.</p></div></div><textarea className="form-input mt-4 min-h-24" value={customRequest} onChange={(event) => setCustomRequest(event.target.value)} placeholder="Example: Please add fresh ugu if it is available. No substitutions without asking me." /></Card></div>
        <div><Card className="h-fit p-5 lg:sticky lg:top-24"><div className="flex items-start justify-between gap-4"><div><span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Your FastErrand</span><strong className="mt-1 block text-3xl font-black text-fleet-night">{formatMoney(itemTotal)}</strong></div><StatusBadge tone="green">{itemCount} items</StatusBadge></div><div className="mt-5 grid gap-3">{!cartItems.length ? <div className="rounded-fleet bg-fleet-paper p-3 text-sm font-bold text-slate-500">Choose your FastErrand items to see your checkout total.</div> : cartItems.map((item) => <div key={item.id} className="rounded-fleet bg-fleet-paper p-3"><div className="flex items-start justify-between gap-3"><span className="min-w-0"><strong className="block text-sm font-black text-fleet-night">{item.name}</strong><span className="text-xs font-bold text-slate-500">{item.category} · {item.quantity} × {formatMoney(item.price_ngn)}</span></span><strong className="shrink-0 text-sm font-black text-fleet-night">{formatMoney(item.price_ngn * item.quantity)}</strong></div></div>)}</div><div className="mt-5 grid gap-2 border-t border-fleet-line pt-4 text-sm font-bold"><div className="flex items-center justify-between gap-4"><span className="text-slate-600">Items subtotal</span><span className="text-fleet-night">{formatMoney(itemTotal)}</span></div><p className="text-xs font-semibold leading-5 text-slate-500">Delivery and the standard FastErrand charge are calculated securely at checkout from your delivery address.</p></div><div className="mt-5 grid gap-3"><input className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email for receipt" type="email" /><input className="form-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" inputMode="tel" /><AddressAutocompleteInput label="Delivery address" value={address} onChange={setAddress} placeholder="Enter recipient street address" /><Button type="button" onClick={checkout} disabled={loading || !cartItems.length || !fulfilmentConfigured}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}Checkout FastErrand</Button></div>{message ? <p className="mt-3 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{message}</p> : null}</Card></div></div>
      {activeErrands.length ? <Card className="mt-5 p-5"><h2 className="text-lg font-black text-fleet-night">Your active FastErrands</h2><div className="mt-3 grid gap-3">{activeErrands.map((errand) => <div key={errand.id} className="flex flex-col gap-3 rounded-fleet bg-fleet-paper p-3 sm:flex-row sm:items-center sm:justify-between"><span><strong className="block text-sm font-black text-fleet-night">{errand.errand_code} · {errand.vendor_name}</strong><span className="text-xs font-bold text-slate-500">{errand.status === "top_up_required" ? "Your order needs an approved adjustment." : errand.status.replaceAll("_", " ")}</span></span>{errand.status === "top_up_required" ? <Button size="sm" onClick={() => payTopUp(errand.id)} disabled={loading}>Approve {formatMoney(errand.top_up_required_ngn)} adjustment</Button> : <StatusBadge tone={errand.status === "vendor_funded" ? "green" : "amber"}>{errand.status.replaceAll("_", " ")}</StatusBadge>}</div>)}</div></Card> : null}
    </section>
  </>;
}
