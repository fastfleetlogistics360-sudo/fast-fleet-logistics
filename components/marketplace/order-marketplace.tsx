"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Minus, Plus, ShoppingCart } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { PLATFORM_CHECKOUT_FEE_NGN } from "@/lib/fare";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

const deliveryFee = 1000;

type StoreItem = {
  name: string;
  type: string;
  price: number;
};

export type Store = {
  name: string;
  area: string;
  description: string;
  items: StoreItem[];
};

export function OrderMarketplace({ title, eyebrow, stores, kind }: { title: string; eyebrow: string; stores: Store[]; kind: "restaurant" | "shopping" }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("Lekki Phase 1, Lagos");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedItems = useMemo(
    () =>
      stores.flatMap((store) =>
        store.items
          .map((item) => {
            const key = itemKey(store.name, item.name);
            const quantity = quantities[key] || 0;
            return { ...item, store: store.name, key, quantity, subtotal: quantity * item.price };
          })
          .filter((item) => item.quantity > 0)
      ),
    [quantities, stores]
  );
  const itemsTotal = selectedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const total = itemsTotal + PLATFORM_CHECKOUT_FEE_NGN + deliveryFee;

  function changeQuantity(key: string, delta: number) {
    setQuantities((current) => ({ ...current, [key]: Math.max(0, (current[key] || 0) + delta) }));
  }

  async function checkout() {
    setMessage(null);
    if (selectedItems.length === 0) {
      setMessage("Add at least one item before checkout.");
      return;
    }
    if (!email.trim()) {
      setMessage("Enter an email address for Paystack checkout.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/marketplace/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          email,
          phone,
          address,
          items: selectedItems.map(({ name, store, quantity, price, subtotal }) => ({ name, store, quantity, price, subtotal })),
          fees: {
            platformFee: PLATFORM_CHECKOUT_FEE_NGN,
            deliveryFee
          },
          amount: total
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error || "Paystack checkout failed.");
      window.location.assign(payload.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section-wrap py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">{eyebrow}</span>
          <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-6xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
            Open a store, pick items with the plus button, then checkout through Paystack. FastFleet adds {formatMoney(PLATFORM_CHECKOUT_FEE_NGN)} platform fee and {formatMoney(deliveryFee)} delivery fee automatically.
          </p>

          <div className="mt-8 grid gap-4">
            {stores.map((store) => (
              <details key={store.name} className="group overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_18px_48px_rgba(8,17,31,0.08)]" open>
                <summary className="flex cursor-pointer items-center justify-between gap-4 p-4">
                  <span>
                    <strong className="block text-xl font-black text-fleet-night">{store.name}</strong>
                    <span className="mt-1 block text-sm font-bold text-slate-500">{store.area} · {store.description}</span>
                  </span>
                  <ChevronDown className="h-5 w-5 shrink-0 text-fleet-ember transition group-open:rotate-180" />
                </summary>
                <div className="grid gap-3 border-t border-fleet-line p-4 md:grid-cols-2">
                  {store.items.map((item) => {
                    const key = itemKey(store.name, item.name);
                    const quantity = quantities[key] || 0;
                    return (
                      <article key={key} className="rounded-fleet border border-fleet-line bg-fleet-paper p-3">
                        <div className="flex items-start justify-between gap-3">
                          <span>
                            <strong className="block text-sm font-black text-fleet-night">{item.name}</strong>
                            <span className="mt-1 block text-xs font-bold text-slate-500">{item.type}</span>
                          </span>
                          <strong className="text-sm font-black text-fleet-night">{formatMoney(item.price)}</strong>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2 rounded-fleet bg-white p-1">
                            <button type="button" onClick={() => changeQuantity(key, -1)} className="grid h-9 w-9 place-items-center rounded-fleet text-fleet-night" aria-label={`Remove ${item.name}`}>
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="min-w-8 text-center text-sm font-black text-fleet-night">{quantity}</span>
                            <button type="button" onClick={() => changeQuantity(key, 1)} className="grid h-9 w-9 place-items-center rounded-fleet bg-fleet-night text-white" aria-label={`Add ${item.name}`}>
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                          <span className="text-sm font-black text-fleet-ember">{formatMoney(quantity * item.price)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </div>

        <Card className="sticky top-24 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Checkout</span>
              <strong className="mt-1 block text-3xl font-black text-fleet-night">{formatMoney(total)}</strong>
            </div>
            <StatusBadge tone="green">{selectedItems.length} items</StatusBadge>
          </div>

          <div className="mt-5 grid gap-3">
            {selectedItems.length === 0 ? <div className="rounded-fleet bg-fleet-paper p-3 text-sm font-bold text-slate-500">No items selected yet.</div> : null}
            {selectedItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-fleet bg-fleet-paper p-3">
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-black text-fleet-night">{item.name}</strong>
                  <span className="text-xs font-bold text-slate-500">{item.quantity} portion · {item.store}</span>
                </span>
                <strong className="text-sm font-black text-fleet-night">{formatMoney(item.subtotal)}</strong>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-2 text-sm font-bold">
            <Summary label="Items" value={formatMoney(itemsTotal)} />
            <Summary label="Platform fee" value={formatMoney(PLATFORM_CHECKOUT_FEE_NGN)} />
            <Summary label="Delivery fee" value={formatMoney(deliveryFee)} />
          </div>

          <div className="mt-5 grid gap-3">
            <input className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email for receipt" type="email" />
            <input className="form-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" inputMode="tel" />
            <textarea className="form-textarea min-h-20" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Delivery address" />
            <Button type="button" onClick={checkout} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              Pay with Paystack
            </Button>
          </div>
          {message ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{message}</div> : null}
        </Card>
      </div>
    </section>
  );
}

function itemKey(store: string, item: string) {
  return `${store}:${item}`;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-fleet bg-fleet-paper px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <strong className="text-fleet-night">{value}</strong>
    </div>
  );
}
