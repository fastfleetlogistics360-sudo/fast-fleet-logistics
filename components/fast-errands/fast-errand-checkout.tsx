"use client";
/* eslint-disable @next/next/no-img-element -- catalogue images are admin-managed URLs or local fallbacks. */

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, Minus, Plus, ShoppingCart, Sparkles } from "lucide-react";
import { AddressAutocompleteInput } from "@/components/location/address-autocomplete-input";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format";
import type { FastErrandsCatalogItem, FastErrandsCategory } from "@/lib/fast-errands-catalog";

type CartItem = FastErrandsCatalogItem & { category: string; quantity: number; subtotal?: number };
type Quote = { fingerprint: string; goodsSubtotalNgn: number; minimumCartNgn: number; amountToMinimumNgn: number; serviceFeeNgn: number; customerTotalNgn: number; roadDistanceMeters: number; displayDistanceKm: number; etaMinutes: number; vehicleOptions: Array<{ id: "bicycle" | "motorcycle"; label: string; description: string; availability: { status: "available" | "limited" | "unavailable"; label: string } }> };

const categoryArt: Record<string, string> = {
  "Fresh Produce": "/fast-errands/fresh-produce.webp",
  Foodstuff: "/fast-errands/foodstuff.webp",
  "Drinks & Snacks": "/fast-errands/drinks-party.webp",
  "Protein & Frozen": "/fast-errands/protein-frozen.webp",
  "Personal Care": "/fast-errands/care-home.webp",
  "Home Essentials": "/fast-errands/care-home.webp",
  "Party & Hangout": "/fast-errands/drinks-party.webp"
};

function productImage(item: FastErrandsCatalogItem, categoryName: string) {
  return item.image_url || categoryArt[categoryName] || "/fast-errands/foodstuff.webp";
}

export function FastErrandCheckout({ catalog, neighborhoodEnabled }: { catalog: FastErrandsCategory[]; neighborhoodEnabled: boolean }) {
  const [activeCategoryId, setActiveCategoryId] = useState(catalog[0]?.id || "");
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const activeCategory = catalog.find((category) => category.id === activeCategoryId) || catalog[0] || null;
  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const displayedSubtotal = useMemo(() => cartItems.reduce((total, item) => total + Number(item.price_ngn) * item.quantity, 0), [cartItems]);
  const minimumRemaining = Math.max(0, 1500 - displayedSubtotal);

  useEffect(() => {
    if (!neighborhoodEnabled || !cartItems.length || address.trim().length < 6) {
      setQuote(null);
      setSelectedVehicle("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      setMessage(null);
      try {
        const response = await fetch("/api/fast-errands/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ items: cartItems.map((item) => ({ itemId: item.id, quantity: item.quantity })), address })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not refresh your FastErrand quote.");
        const next = data.quote as Quote;
        setQuote(next);
        setSelectedVehicle((current) => next.vehicleOptions.find((option) => option.id === current && option.availability.status !== "unavailable")?.id || next.vehicleOptions.find((option) => option.availability.status !== "unavailable")?.id || "");
      } catch (error) {
        if (!controller.signal.aborted) {
          setQuote(null);
          setSelectedVehicle("");
          setMessage(error instanceof Error ? error.message : "Could not refresh your quote.");
        }
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    }, 500);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [address, cartItems, neighborhoodEnabled]);

  function changeQuantity(item: FastErrandsCatalogItem, delta: number) {
    setCart((current) => {
      const quantity = Math.max(0, (current[item.id]?.quantity || 0) + delta);
      const next = { ...current };
      if (!quantity) delete next[item.id];
      else next[item.id] = { ...item, category: activeCategory?.name || "FastErrand", quantity };
      return next;
    });
  }

  async function checkout() {
    if (!quote || !selectedVehicle || !email.includes("@")) return setMessage("Add your receipt email, delivery address, and choose an available rider option.");
    setPaying(true); setMessage(null);
    try {
      const response = await fetch("/api/fast-errands/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cartItems.map((item) => ({ itemId: item.id, quantity: item.quantity })), address, email, phone, note, vehicleOption: selectedVehicle, quoteFingerprint: quote.fingerprint }) });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.quote) { setQuote((current) => current ? { ...current, ...data.quote } : current); throw new Error(data.error || "Your quote changed. Review it and try again."); }
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || "Could not start FastErrand payment.");
      window.location.assign(data.authorizationUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start payment."); setPaying(false); }
  }

  return <div className="overflow-x-hidden"><BackButton className="section-wrap pb-3 pt-4" /><section className="section-wrap pb-14 pt-1">
    <div className="relative isolate overflow-hidden rounded-[24px] bg-[#071728] px-5 py-5 text-white shadow-[0_18px_50px_rgba(8,17,31,0.16)] sm:px-7 sm:py-6">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_88%_18%,rgba(245,158,11,0.2),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.035),transparent_55%)]" />
      <div className="max-w-2xl"><span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-orange-200"><Sparkles className="h-3.5 w-3.5" /> FastErrand</span><h1 className="mt-2 text-2xl font-black tracking-[-0.045em] sm:text-3xl">Essentials. Delivered.</h1><p className="mt-1.5 text-sm font-semibold text-slate-300">Local picks, with delivery priced at checkout.</p></div>
    </div>
    {!neighborhoodEnabled ? <Card className="mt-5 p-6"><h2 className="text-xl font-black text-fleet-night">FastErrand is being prepared</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Your neighbourhood catalogue will be available as soon as its first service area is live.</p></Card> : <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
      <div className="min-w-0"><div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div className="flex w-max gap-2">{catalog.map((category) => { const selected = category.id === activeCategory?.id; return <button key={category.id} type="button" onClick={() => setActiveCategoryId(category.id)} className={`min-h-10 rounded-xl border px-3 py-2 text-left transition ${selected ? "border-fleet-night bg-fleet-night text-white shadow-lg shadow-slate-950/10" : "border-fleet-line bg-white text-fleet-night hover:border-orange-200 hover:bg-orange-50"}`}><strong className="block whitespace-nowrap text-xs font-black">{category.name}</strong></button>; })}</div></div>
      {activeCategory ? <div className="mt-3"><div className="mb-3 flex items-end justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-fleet-ember">Collection</p><h2 className="mt-0.5 text-xl font-black tracking-[-0.03em] text-fleet-night">{activeCategory.name}</h2></div><p className="text-xs font-bold text-slate-500">{activeCategory.items.length} items</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{activeCategory.items.map((item) => <ProductCard key={item.id} item={item} category={activeCategory.name} quantity={cart[item.id]?.quantity || 0} onChange={changeQuantity} />)}</div></div> : null}</div>
      <aside className="min-w-0 lg:sticky lg:top-24 lg:h-fit"><Card className="overflow-hidden border-slate-200 p-0 shadow-[0_16px_50px_rgba(8,17,31,0.09)]"><div className="bg-fleet-night px-5 py-5 text-white"><div className="flex items-start justify-between gap-3"><div><span className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-200">Your FastErrand</span><b className="mt-2 block text-3xl tracking-[-0.04em]">{formatMoney(quote?.customerTotalNgn || displayedSubtotal)}</b></div><span className="grid h-10 min-w-10 place-items-center rounded-2xl bg-white/10 px-2 text-sm font-black">{cartItems.length}</span></div><p className="mt-2 text-xs font-semibold text-slate-300">{cartItems.length ? "Your curated list is ready to price." : "Add a few essentials to begin."}</p></div><div className="p-5">
        {cartItems.length ? <div className="max-h-44 space-y-2 overflow-y-auto pr-1">{cartItems.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-bold text-slate-700">{item.quantity}× {item.name}</span><span className="shrink-0 font-black text-fleet-night">{formatMoney(item.subtotal || item.price_ngn * item.quantity)}</span></div>)}</div> : <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-500">Choose items from the catalogue. Your delivery total will appear once you add an address.</div>}
        <div className="mt-4 rounded-2xl border border-fleet-line bg-slate-50 p-4">{minimumRemaining > 0 ? <p className="text-xs font-bold leading-5 text-amber-800">Add {formatMoney(minimumRemaining)} more to reach the {formatMoney(1500)} order minimum.</p> : <p className="flex items-center gap-2 text-xs font-black text-emerald-700"><Check className="h-4 w-4" /> Order minimum reached</p>}<div className="mt-3 flex justify-between text-sm font-bold text-slate-600"><span>Items</span><span>{formatMoney(quote?.goodsSubtotalNgn || displayedSubtotal)}</span></div>{quote ? <><div className="mt-2 flex justify-between text-sm font-bold text-slate-600"><span>Delivery</span><span>{formatMoney(quote.serviceFeeNgn)}</span></div><div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base font-black text-fleet-night"><span>Total</span><span>{formatMoney(quote.customerTotalNgn)}</span></div><p className="mt-2 text-xs font-semibold text-slate-500">{quote.displayDistanceKm.toFixed(2)} km by road · about {quote.etaMinutes} min</p></> : null}</div>
        <div className="mt-4 grid gap-3"><input className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email for your receipt" type="email" /><input className="form-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" /><AddressAutocompleteInput label="Where should we deliver?" value={address} onChange={setAddress} placeholder="Search your delivery address" /><textarea className="form-input min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="A helpful note for your fulfilment team (optional)" />{quoteLoading ? <p className="flex items-center gap-2 text-xs font-bold text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your exact route…</p> : null}{quote?.vehicleOptions.map((option) => <button key={option.id} type="button" onClick={() => setSelectedVehicle(option.id)} disabled={option.availability.status === "unavailable"} className={`rounded-2xl border p-3 text-left transition ${selectedVehicle === option.id ? "border-fleet-ember bg-orange-50 ring-1 ring-orange-200" : "border-fleet-line hover:border-slate-300"} disabled:cursor-not-allowed disabled:opacity-45`}><span className="flex items-center justify-between gap-3"><b className="text-sm text-fleet-night">{option.label}</b><StatusBadge tone={option.availability.status === "unavailable" ? "red" : option.availability.status === "limited" ? "yellow" : "green"}>{option.availability.label}</StatusBadge></span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{option.description}</span></button>)}<Button onClick={checkout} disabled={paying || !quote || !selectedVehicle || minimumRemaining > 0} className="w-full">{paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}{paying ? "Securing checkout…" : "Continue to secure checkout"}<ArrowRight className="h-4 w-4" /></Button></div>{message ? <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">{message}</p> : null}
      </div></Card></aside>
    </div>}</section></div>;
}

function ProductCard({ item, category, quantity, onChange }: { item: FastErrandsCatalogItem; category: string; quantity: number; onChange: (item: FastErrandsCatalogItem, delta: number) => void }) {
  return <Card className={`group overflow-hidden border p-0 transition duration-200 ${quantity ? "border-orange-300 shadow-[0_8px_24px_rgba(234,88,12,0.1)]" : "border-fleet-line hover:border-slate-300 hover:shadow-md"}`}><div className="relative aspect-[4/3] overflow-hidden bg-slate-100"><img src={productImage(item, category)} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /></div><div className="p-2.5"><div className="flex min-w-0 items-start justify-between gap-2"><h3 className="min-w-0 truncate text-sm font-black text-fleet-night">{item.name}</h3><b className="shrink-0 text-xs font-black text-fleet-night">{formatMoney(item.price_ngn)}</b></div><div className="mt-2 flex items-center justify-between"><span className={`text-[11px] font-black ${quantity ? "text-fleet-ember" : "text-slate-400"}`}>{quantity ? `${quantity} added` : "In stock"}</span><span className="flex items-center gap-1.5"><button type="button" aria-label={`Remove ${item.name}`} disabled={!quantity} onClick={() => onChange(item, -1)} className="grid h-7 w-7 place-items-center rounded-full border border-fleet-line text-fleet-night transition hover:bg-slate-50 disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button><span className="w-3 text-center text-xs font-black text-fleet-night">{quantity}</span><button type="button" aria-label={`Add ${item.name}`} onClick={() => onChange(item, 1)} className="grid h-7 w-7 place-items-center rounded-full bg-fleet-night text-white transition hover:bg-fleet-ember"><Plus className="h-3.5 w-3.5" /></button></span></div></div></Card>;
}
