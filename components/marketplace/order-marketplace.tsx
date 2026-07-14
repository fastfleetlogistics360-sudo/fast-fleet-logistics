"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, Minus, Plus, ShoppingCart, Utensils } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { PLATFORM_CHECKOUT_FEE_NGN } from "@/lib/fare";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { AddressAutocompleteInput } from "@/components/location/address-autocomplete-input";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMarketplaceEstimate } from "@/components/marketplace/use-marketplace-estimate";

type StoreItem = {
  id?: string;
  name: string;
  type: string;
  price: number;
  portion?: string;
  imageUrl?: string;
};

export type Store = {
  id?: string;
  businessId?: string;
  name: string;
  area: string;
  address?: string;
  description: string;
  mealTypes?: string[];
  imageUrl?: string;
  items: StoreItem[];
};

export function RestaurantVendorSelection({ stores }: { stores: Store[] }) {
  const [liveStores, setLiveStores] = useState<Store[]>(stores);
  const vendorCount = liveStores.length;
  const itemCount = liveStores.reduce((count, store) => count + store.items.length, 0);

  useEffect(() => {
    setLiveStores(stores);
  }, [stores]);

  return (
    <>
      <BackButton className="section-wrap pb-4 pt-4" />
      <section className="section-wrap pb-28 pt-2 sm:pb-14">
        <div className="overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-lift">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="p-4 sm:p-5 lg:p-6">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Restaurants</span>
              <h1 className="mt-2 text-2xl font-black leading-tight text-fleet-night sm:text-4xl">Choose a restaurant.</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                Open a kitchen page, pick menu items, add your delivery address, and checkout with Squad.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge tone="green">{vendorCount} restaurants</StatusBadge>
                <StatusBadge tone="neutral">{itemCount} menu items</StatusBadge>
              </div>
            </div>
            <img
              src="https://images.unsplash.com/photo-1555396273-367ea4eb4db9?auto=format&fit=crop&w=900&q=72"
              alt="Restaurant delivery"
              loading="eager"
              decoding="async"
              className="hidden h-full min-h-[190px] w-full object-cover lg:block"
            />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {liveStores.map((store) => (
            <Link key={store.id || store.name} href={`/restaurants/${store.id || itemKey(store.name, "kitchen")}`} className="group block focus:outline-none focus:ring-2 focus:ring-fleet-ember">
              <article className="overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_8px_18px_rgba(8,17,31,0.06)] transition hover:-translate-y-1 hover:border-fleet-ember">
                <div className="relative h-28 overflow-hidden bg-fleet-paper">
                  {store.imageUrl ? (
                    <Image src={store.imageUrl} alt={store.name} fill sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw" quality={62} loading="lazy" className="object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-fleet-ember">
                      <Utensils className="h-8 w-8" />
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[0.6rem] font-black uppercase tracking-[0.1em] text-fleet-ember">
                    {store.area}
                  </span>
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <strong className="line-clamp-1 block text-base font-black leading-tight text-fleet-night">{store.name}</strong>
                      <span className="mt-1 line-clamp-2 block text-xs font-bold leading-5 text-slate-500">{store.description}</span>
                    </span>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-fleet-ember transition group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[0.65rem] font-black text-slate-500">
                    <span className="rounded-full bg-fleet-paper px-2 py-1">{store.items.length} items</span>
                    {store.mealTypes?.slice(0, 2).map((mealType) => (
                      <span key={mealType} className="rounded-full bg-fleet-paper px-2 py-1">{mealType}</span>
                    ))}
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

export function OrderMarketplace({ title, eyebrow, stores, kind }: { title: string; eyebrow: string; stores: Store[]; kind: "restaurant" | "shopping" }) {
  const [liveStores, setLiveStores] = useState<Store[]>(stores);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeMenuType, setActiveMenuType] = useState("All Items");
  const checkoutRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLiveStores(stores);
  }, [stores]);

  const selectedItems = useMemo(
    () =>
      liveStores.flatMap((store) =>
        store.items
          .map((item) => {
            const key = itemKey(store.name, item.name);
            const quantity = quantities[key] || 0;
            return {
              ...item,
              store: store.name,
              storeAddress: store.address || store.area || store.name,
              storeId: store.id,
              businessId: store.businessId,
              key,
              quantity,
              subtotal: quantity * item.price
            };
          })
          .filter((item) => item.quantity > 0)
      ),
    [quantities, liveStores]
  );
  const checkoutItems = useMemo(
    () =>
      selectedItems.map(({ name, store, storeAddress, storeId, businessId, quantity, price, subtotal }) => ({
        name,
        store,
        storeAddress,
        storeId,
        businessId,
        quantity,
        price,
        subtotal
      })),
    [selectedItems]
  );
  const { estimate, loading: estimateLoading, error: estimateError } = useMarketplaceEstimate({ kind, address, items: checkoutItems });
  const itemsTotal = selectedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const platformFee = estimate?.platformFee ?? PLATFORM_CHECKOUT_FEE_NGN;
  const deliveryFee = estimate?.deliveryFee ?? 0;
  const total = estimate?.total ?? itemsTotal + platformFee;
  const menuTypes = useMemo(() => {
    const types = liveStores.flatMap((store) => store.items.map((item) => item.type).filter(Boolean));
    return ["All Items", ...Array.from(new Set(types))];
  }, [liveStores]);
  const menuItems = useMemo(
    () =>
      liveStores
        .flatMap((store) =>
          store.items.map((item) => {
            const key = itemKey(store.name, item.name);
            return { store, item, key, quantity: quantities[key] || 0 };
          })
        )
        .filter(({ item }) => activeMenuType === "All Items" || item.type === activeMenuType),
    [activeMenuType, liveStores, quantities]
  );

  useEffect(() => {
    if (!menuTypes.includes(activeMenuType)) setActiveMenuType("All Items");
  }, [activeMenuType, menuTypes]);

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
      setMessage("Enter an email address for Squad checkout.");
      return;
    }
    if (address.trim().length < 6) {
      setMessage("Enter the delivery street address.");
      return;
    }
    if (estimateLoading || !estimate) {
      setMessage(estimateError || "Please wait for the delivery estimate to finish.");
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
          items: checkoutItems,
          fees: {
            platformFee: estimate.platformFee,
            deliveryFee: estimate.deliveryFee
          },
          amount: estimate.total
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error || "Squad checkout failed.");
      const deliveryCode = String(payload.reference || `FFM-${Date.now()}`).toUpperCase();
      const businessOrder = Boolean(payload.businessOrder);
      const stored = JSON.parse(localStorage.getItem("fastfleet.next.deliveries") || "[]");
      localStorage.setItem(
        "fastfleet.next.deliveries",
        JSON.stringify([
          {
            user_id: payload.userId || null,
            customer_id: payload.userId || null,
            delivery_code: deliveryCode,
            pickup_address: selectedItems.map((item) => item.store).filter(Boolean).join(", ") || (kind === "restaurant" ? "Restaurant pickup" : "Shopping pickup"),
            dropoff_address: address,
            status: payload.status || (businessOrder ? "received" : "searching"),
            vehicle_type: "bike",
            vehicle_subtype: payload.vehicleSubtype || null,
            delivery_speed: "same_day",
            price_ngn: estimate.total,
            distance_km: estimate.distanceKm,
            eta_minutes: estimate.etaMinutes,
            metadata: { vehicle_subtype: payload.vehicleSubtype || null },
            source: businessOrder ? "business_marketplace_order" : `${kind}_checkout`,
            marketplace_kind: kind,
            items: selectedItems.map(({ name, store, quantity }) => ({ name, store, quantity })),
            created_at: new Date().toISOString()
          },
          ...stored
        ])
      );
      window.location.assign(payload.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <BackButton className="section-wrap pb-4 pt-4" />
    <section className="section-wrap pb-28 pt-2 sm:pb-12">
      <div className="mb-5 overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-lift">
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="p-4 sm:p-5">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">{eyebrow}</span>
            <h1 className="mt-2 break-words text-2xl font-black leading-tight text-fleet-night sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">Choose items, add your address, and pay with Squad.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge tone="green">{liveStores.length} restaurant{liveStores.length === 1 ? "" : "s"}</StatusBadge>
              <StatusBadge tone="neutral">{selectedItems.length} selected</StatusBadge>
            </div>
          </div>
          <img
            src={liveStores[0]?.imageUrl || "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=72"}
            alt={title}
            loading="eager"
            decoding="async"
            className="hidden h-full min-h-[180px] w-full object-cover md:block"
          />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0">
          <div className="rounded-fleet border border-fleet-line bg-white p-4 shadow-[0_10px_24px_rgba(8,17,31,0.06)] sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Menu</span>
                <h2 className="mt-2 break-words text-xl font-black leading-tight text-fleet-night sm:text-2xl">Pick from the open menu.</h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                  Fast Fleets 360 estimates delivery after your address and adds a {formatMoney(platformFee)} platform fee.
                </p>
              </div>
              <StatusBadge tone="green">{menuItems.length} items</StatusBadge>
            </div>
            <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
              {menuTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActiveMenuType(type)}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-black transition",
                    activeMenuType === type ? "bg-fleet-ember text-white shadow-[0_12px_26px_rgba(244,126,24,0.20)]" : "bg-fleet-paper text-fleet-night hover:bg-white hover:shadow-[0_10px_24px_rgba(8,17,31,0.08)]"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4">
            {menuItems.length ? (
              menuItems.map(({ store, item, key, quantity }) => (
                <RestaurantMenuItemCard key={key} store={store} item={item} itemKeyValue={key} quantity={quantity} showStoreName={liveStores.length > 1} onQuantity={changeQuantity} />
              ))
            ) : (
              <Card className="col-span-full p-5 text-center">
                <h3 className="text-xl font-black text-fleet-night">No items here yet</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Try another menu category.</p>
              </Card>
            )}
          </div>
        </div>

        <div ref={checkoutRef}>
        <Card className="p-4 sm:p-5 lg:sticky lg:top-24">
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
            <Summary label="Platform fee" value={formatMoney(platformFee)} />
            <Summary label="Delivery fee" value={estimateLoading ? "Estimating..." : estimate ? formatMoney(deliveryFee) : "Add address"} />
            {estimate ? <Summary label="Route distance" value={`${estimate.distanceKm.toFixed(1)} km`} /> : null}
          </div>

          <div className="mt-5 grid gap-3">
            <input className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email for receipt" type="email" />
            <input className="form-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" inputMode="tel" />
            <AddressAutocompleteInput label="Delivery address" value={address} onChange={setAddress} placeholder="Enter recipient street address" />
            <Button type="button" onClick={checkout} disabled={loading || estimateLoading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              Pay with Squad
            </Button>
          </div>
          {message || estimateError ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{message || estimateError}</div> : null}
        </Card>
        </div>
      </div>
      <MobileCartBar count={selectedItems.length} total={total} label="Your Order" onOpen={() => checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
    </section>
    </>
  );
}

function RestaurantMenuItemCard({
  store,
  item,
  itemKeyValue,
  quantity,
  showStoreName,
  onQuantity,
}: {
  store: Store;
  item: StoreItem;
  itemKeyValue: string;
  quantity: number;
  showStoreName: boolean;
  onQuantity: (key: string, delta: number) => void;
}) {
  return (
    <article className="flex min-h-full flex-col overflow-hidden rounded-[16px] border border-fleet-line bg-white shadow-[0_8px_18px_rgba(8,17,31,0.06)] transition hover:border-fleet-ember">
      <div className="relative h-24 overflow-hidden bg-fleet-paper sm:h-28">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.name} fill sizes="(min-width: 1280px) 18vw, (min-width: 768px) 30vw, 50vw" quality={62} loading="lazy" className="object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-fleet-ember">
            <Utensils className="h-7 w-7" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-fleet-paper px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-[0.1em] text-fleet-ember">{item.type}</span>
          {showStoreName ? <span className="rounded-full bg-fleet-paper px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-[0.1em] text-slate-500">{store.name}</span> : null}
        </div>
        <h3 className="mt-1.5 line-clamp-2 min-h-[2.25rem] break-words text-sm font-black leading-tight text-fleet-night">{item.name}</h3>
        <p className="mt-1 line-clamp-1 text-[0.7rem] font-bold leading-4 text-slate-500">{item.portion || "1 portion"}</p>
        <strong className="mt-2 block text-base font-black text-fleet-ember">{formatMoney(item.price)}</strong>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <div className="inline-flex h-9 items-center rounded-[12px] bg-fleet-paper p-0.5">
            <button type="button" onClick={() => onQuantity(itemKeyValue, -1)} className="grid h-8 w-8 place-items-center rounded-[10px] text-fleet-night" aria-label={`Remove ${item.name}`}>
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-7 text-center text-xs font-black text-fleet-night">{quantity}</span>
            <button type="button" onClick={() => onQuantity(itemKeyValue, 1)} className="grid h-8 w-8 place-items-center rounded-[10px] bg-fleet-night text-white shadow-[0_8px_18px_rgba(8,17,31,0.16)]" aria-label={`Add ${item.name}`}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <strong className="text-xs font-black text-fleet-night">{formatMoney(quantity * item.price)}</strong>
        </div>
      </div>
    </article>
  );
}

function MobileCartBar({ count, total, label, onOpen }: { count: number; total: number; label: string; onOpen: () => void }) {
  if (!count) return null;
  return (
    <div className="fixed inset-x-3 bottom-24 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-[20px] border border-fleet-ember/20 bg-white/95 p-3 shadow-[0_18px_48px_rgba(8,17,31,0.18)] backdrop-blur-2xl lg:hidden">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[16px] bg-orange-50 text-fleet-ember">
        <ShoppingCart className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-black text-fleet-night">{label}</strong>
        <span className="text-xs font-bold text-slate-500">{count} item{count === 1 ? "" : "s"}</span>
      </span>
      <strong className="text-sm font-black text-fleet-night">{formatMoney(total)}</strong>
      <Button type="button" size="sm" onClick={onOpen}>View Cart</Button>
    </div>
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
