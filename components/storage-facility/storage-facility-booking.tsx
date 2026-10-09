"use client";

import { useEffect, useMemo, useState } from "react";
import { Warehouse } from "lucide-react";
import { AddressAutocompleteInput } from "@/components/location/address-autocomplete-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { openSecureCheckout } from "@/lib/payments/open-secure-checkout";

type StorageItem = { id: string; name: string; description?: string | null; is_other: boolean };
type CartItem = { itemId: string; quantity: number; otherDescription: string };
type Quote = { fingerprint: string; storageSubtotalNgn: number; totalNgn: number; pickup?: { feeNgn: number; distanceKm: number } | null };

export function StorageFacilityBooking() {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [duration, setDuration] = useState("week_1");
  const [pickup, setPickup] = useState(false);
  const [address, setAddress] = useState("");
  const [vehicle, setVehicle] = useState("bike");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instructions, setInstructions] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const activeItems = useMemo(() => cart.filter((item) => item.quantity > 0), [cart]);

  useEffect(() => {
    fetch("/api/storage-facility/catalog")
      .then((response) => response.json())
      .then((data) => setItems(data.items || []))
      .catch(() => setMessage("Storage catalogue is unavailable."));
  }, []);

  useEffect(() => {
    if (!activeItems.length) { setQuote(null); return; }
    const timeout = window.setTimeout(() => {
      fetch("/api/storage-facility/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: activeItems, duration, pickupSelected: pickup, pickupAddress: address, pickupVehicle: vehicle }),
      })
        .then(async (response) => ({ ok: response.ok, data: await response.json() }))
        .then(({ ok, data }) => ok ? setQuote(data.quote) : setMessage(data.error || "Could not quote storage."))
        .catch(() => setMessage("Could not quote storage."));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [activeItems, duration, pickup, address, vehicle]);

  function changeQuantity(item: StorageItem, quantity: number) {
    setCart((current) => {
      const previous = current.find((entry) => entry.itemId === item.id);
      const withoutItem = current.filter((entry) => entry.itemId !== item.id);
      return quantity > 0 ? [...withoutItem, { itemId: item.id, quantity, otherDescription: previous?.otherDescription || "" }] : withoutItem;
    });
  }

  async function checkout() {
    if (!quote || !acknowledged || !email.includes("@")) { setMessage("Add a receipt email and confirm the prohibited-items notice."); return; }
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/storage-facility/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: activeItems, duration, pickupSelected: pickup, pickupAddress: address, pickupVehicle: vehicle, email, phone, pickupInstructions: instructions, prohibitedAcknowledged: acknowledged, quoteFingerprint: quote.fingerprint }),
      });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || "Could not begin payment.");
      await openSecureCheckout(data.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not begin payment.");
    } finally { setLoading(false); }
  }

  return <main className="section-wrap pb-12 pt-7">
    <div className="rounded-[24px] bg-fleet-night p-6 text-white"><Warehouse className="h-8 w-8 text-orange-300" /><h1 className="mt-2 text-3xl font-black">BOOK STORAGE FACILITY</h1><p className="mt-2 text-sm font-semibold text-slate-300">Store it. We&apos;ll keep it safe. Bring it to us or let Fast Fleets 360 pick it up.</p></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
      <Card className="p-5"><h2 className="text-xl font-black">Choose items</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{items.map((item) => {
        const entry = cart.find((cartItem) => cartItem.itemId === item.id); const quantity = entry?.quantity || 0;
        return <div className="rounded-fleet bg-fleet-paper p-3" key={item.id}><b>{item.name}</b><p className="text-xs text-slate-500">{item.description}</p><div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" onClick={() => changeQuantity(item, Math.max(0, quantity - 1))}>−</Button><b className="py-2">{quantity}</b><Button size="sm" onClick={() => changeQuantity(item, quantity + 1)}>+</Button></div>{item.is_other && entry ? <textarea className="form-input mt-2" value={entry.otherDescription} onChange={(event) => setCart((current) => current.map((cartItem) => cartItem.itemId === item.id ? { ...cartItem, otherDescription: event.target.value } : cartItem))} placeholder="Describe this item" /> : null}</div>;
      })}</div></Card>
      <Card className="h-fit p-5"><h2 className="text-xl font-black">Review booking</h2><select className="form-input mt-3" value={duration} onChange={(event) => setDuration(event.target.value)}><option value="day_1">1 Day</option><option value="day_3">3 Days</option><option value="week_1">1 Week</option><option value="week_2">2 Weeks</option><option value="month_1">1 Month</option></select><label className="mt-4 block font-bold"><input type="checkbox" checked={pickup} onChange={(event) => setPickup(event.target.checked)} /> Pick them up for me</label>{pickup ? <><AddressAutocompleteInput label="Pickup address" value={address} onChange={setAddress} /><select className="form-input mt-2" value={vehicle} onChange={(event) => setVehicle(event.target.value)}><option value="bike">Bike</option><option value="car">Car</option><option value="van">Van</option></select><textarea className="form-input mt-2" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Pickup instructions" /></> : null}<input className="form-input mt-3" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Receipt email" /><input className="form-input mt-2" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" />{quote ? <div className="mt-4 border-t pt-3 text-sm font-bold"><div className="flex justify-between"><span>Storage subtotal</span><span>{formatMoney(quote.storageSubtotalNgn)}</span></div><div className="mt-2 flex justify-between"><span>Pickup</span><span>{formatMoney(quote.pickup?.feeNgn || 0)}</span></div><div className="mt-2 flex justify-between text-base"><span>Total</span><span>{formatMoney(quote.totalNgn)}</span></div></div> : null}<label className="mt-4 block text-xs font-bold"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I confirm my items contain no prohibited or hazardous goods.</label><Button className="mt-4 w-full" disabled={!quote || loading} onClick={checkout}>{loading ? "Starting payment…" : "Checkout"}</Button>{message ? <p className="mt-3 text-xs font-bold text-amber-800">{message}</p> : null}</Card>
    </div>
  </main>;
}
