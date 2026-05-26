"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Loader2, MapPin, Minus, Plus, ShoppingCart, Utensils } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { PLATFORM_CHECKOUT_FEE_NGN } from "@/lib/fare";
import { normalizeRestaurantKitchens, restaurantMenuStorageKey } from "@/lib/restaurant-menu";
import { cn } from "@/lib/cn";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";
import { StatusBadge } from "@/components/ui/status-badge";

const deliveryFee = 1000;

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
  name: string;
  area: string;
  address?: string;
  description: string;
  mealTypes?: string[];
  imageUrl?: string;
  items: StoreItem[];
};

export function OrderMarketplace({ title, eyebrow, stores, kind }: { title: string; eyebrow: string; stores: Store[]; kind: "restaurant" | "shopping" }) {
  const [liveStores, setLiveStores] = useState<Store[]>(stores);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("Lekki Phase 1, Lagos");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeStore, setActiveStore] = useState(0);
  const storeRefs = useRef<Array<HTMLElement | null>>([]);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setLiveStores(stores);
  }, [stores]);

  useEffect(() => {
    if (kind !== "restaurant") return;

    function applyStoredMenu() {
      try {
        const stored = window.localStorage.getItem(restaurantMenuStorageKey);
        if (stored) setLiveStores(normalizeRestaurantKitchens(JSON.parse(stored)));
      } catch {
        // Keep the server-rendered menu when locally saved menu data is malformed.
      }
    }

    applyStoredMenu();
    fetch("/api/marketplace/restaurants")
      .then((response) => response.json())
      .then((payload) => {
        if (Array.isArray(payload.restaurants)) {
          const restaurants = normalizeRestaurantKitchens(payload.restaurants);
          setLiveStores(restaurants);
          window.localStorage.setItem(restaurantMenuStorageKey, JSON.stringify(restaurants));
        }
      })
      .catch(() => applyStoredMenu());

    window.addEventListener("storage", applyStoredMenu);
    return () => window.removeEventListener("storage", applyStoredMenu);
  }, [kind]);

  const selectedItems = useMemo(
    () =>
      liveStores.flatMap((store) =>
        store.items
          .map((item) => {
            const key = itemKey(store.name, item.name);
            const quantity = quantities[key] || 0;
            return { ...item, store: store.name, key, quantity, subtotal: quantity * item.price };
          })
          .filter((item) => item.quantity > 0)
      ),
    [quantities, liveStores]
  );
  const itemsTotal = selectedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const total = itemsTotal + PLATFORM_CHECKOUT_FEE_NGN + deliveryFee;

  function changeQuantity(key: string, delta: number) {
    setQuantities((current) => ({ ...current, [key]: Math.max(0, (current[key] || 0) + delta) }));
  }

  function handleStoreScroll(event: UIEvent<HTMLDivElement>) {
    const firstCard = storeRefs.current[0];
    if (!firstCard) return;
    const gap = 12;
    const nextIndex = Math.round(event.currentTarget.scrollLeft / (firstCard.offsetWidth + gap));
    setActiveStore(Math.max(0, Math.min(liveStores.length - 1, nextIndex)));
  }

  function goToStore(index: number) {
    storeRefs.current[index]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "start", block: "nearest" });
    setActiveStore(index);
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
      const deliveryCode = String(payload.reference || `FFM-${Date.now()}`).toUpperCase();
      const stored = JSON.parse(localStorage.getItem("fastfleet.next.deliveries") || "[]");
      localStorage.setItem(
        "fastfleet.next.deliveries",
        JSON.stringify([
          {
            delivery_code: deliveryCode,
            pickup_address: selectedItems.map((item) => item.store).filter(Boolean).join(", ") || (kind === "restaurant" ? "Restaurant pickup" : "Shopping pickup"),
            dropoff_address: address,
            status: "searching",
            vehicle_type: "bike",
            delivery_speed: "same_day",
            price_ngn: total,
            eta_minutes: 35,
            source: `${kind}_checkout`,
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
    <CinematicPageHero
      eyebrow={eyebrow}
      title={title}
      body={`Choose items, confirm the delivery address, and checkout through FAST FLEETS360 with transparent fees and Paystack payment flow.`}
      image={kind === "restaurant" ? "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=2200&q=84" : "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=2200&q=84"}
    />
    <section className="section-wrap -mt-8 pb-28 sm:-mt-10 sm:pb-12">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0">
          <div className="rounded-fleet border border-white/70 bg-white/80 p-4 shadow-lift backdrop-blur-xl sm:p-5">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Marketplace lane</span>
          <h2 className="mt-2 break-words text-2xl font-black leading-tight text-fleet-night sm:text-4xl">Pick, pack, and dispatch.</h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
            Open a store, pick items with the plus button, then checkout through Paystack. FAST FLEETS360 adds {formatMoney(PLATFORM_CHECKOUT_FEE_NGN)} platform fee and {formatMoney(deliveryFee)} delivery fee automatically.
          </p>
          </div>

          <div
            className="mt-8 flex w-full snap-x gap-3 overflow-x-auto pb-5 pr-4 [scrollbar-width:none] lg:grid lg:grid-cols-2 lg:gap-4 lg:overflow-visible lg:pr-0 xl:grid-cols-3 [&::-webkit-scrollbar]:hidden"
            onScroll={handleStoreScroll}
          >
            {liveStores.map((store, index) => (
              <RestaurantStoreCard
                key={store.id || store.name}
                store={store}
                index={index}
                quantities={quantities}
                reduceMotion={Boolean(reduceMotion)}
                onQuantity={changeQuantity}
                refCallback={(node) => {
                  storeRefs.current[index] = node;
                }}
              />
            ))}
          </div>
          {liveStores.length > 1 ? (
            <div className="mt-1 flex justify-center gap-2 lg:hidden" aria-label={`${kind} pages`}>
              {liveStores.map((store, index) => (
                <button
                  key={store.id || store.name}
                  type="button"
                  aria-label={`Show ${store.name}`}
                  onClick={() => goToStore(index)}
                  className={cn("h-2 rounded-full transition-all", activeStore === index ? "w-6 bg-fleet-ember" : "w-2 bg-slate-300")}
                />
              ))}
            </div>
          ) : null}
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
    </>
  );
}

function RestaurantStoreCard({
  store,
  index,
  quantities,
  reduceMotion,
  onQuantity,
  refCallback
}: {
  store: Store;
  index: number;
  quantities: Record<string, number>;
  reduceMotion: boolean;
  onQuantity: (key: string, delta: number) => void;
  refCallback: (node: HTMLElement | null) => void;
}) {
  return (
    <motion.details
      ref={refCallback}
      className="group w-[260px] max-w-[72vw] shrink-0 snap-start overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_12px_26px_rgba(8,17,31,0.08)] transition duration-300 lg:w-auto lg:max-w-none"
      initial={reduceMotion ? false : { opacity: 0, y: 26 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      whileHover={reduceMotion ? undefined : { y: -5, scale: 1.01 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <summary className="block cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden">
        <div className="relative aspect-[4/3] overflow-hidden bg-fleet-paper">
          {store.imageUrl ? (
            <Image src={store.imageUrl} alt={store.name} fill sizes="(min-width: 1024px) 33vw, 82vw" quality={64} loading="lazy" className="object-cover transition duration-500 group-hover:scale-105" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-fleet-paper text-fleet-ember">
              <Utensils className="h-8 w-8" />
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-fleet-ember shadow-[0_10px_24px_rgba(8,17,31,0.12)]">
            {store.area}
          </span>
        </div>
        <div className="p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <strong className="line-clamp-1 block text-base font-black leading-tight text-fleet-night">{store.name}</strong>
              <span className="mt-1 line-clamp-2 block text-xs font-bold leading-5 text-slate-500">{store.description}</span>
            </span>
            <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-fleet-ember transition group-open:rotate-180" />
          </div>
          {store.address ? (
            <span className="mt-3 flex items-start gap-1.5 text-xs font-bold leading-5 text-slate-500">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fleet-ember" />
              <span className="line-clamp-2">{store.address}</span>
            </span>
          ) : null}
          {store.mealTypes?.length ? (
            <span className="mt-3 flex flex-wrap gap-1.5">
              {store.mealTypes.slice(0, 3).map((mealType) => (
                <span key={mealType} className="rounded-full bg-fleet-paper px-2 py-1 text-[0.6rem] font-black uppercase tracking-[0.08em] text-slate-500">
                  {mealType}
                </span>
              ))}
            </span>
          ) : null}
          <span className="mt-4 inline-flex min-h-9 w-full items-center justify-center rounded-fleet bg-fleet-night px-3 text-xs font-black text-white transition group-hover:bg-fleet-ember">
            View menu
          </span>
          <LinkButton href={`/restaurants/${store.id || itemKey(store.name, "kitchen")}`} size="sm" variant="secondary" className="mt-2 w-full" onClick={(event) => event.stopPropagation()}>
            Open kitchen page
          </LinkButton>
        </div>
      </summary>
      <div className="grid max-h-[360px] gap-2 overflow-y-auto border-t border-fleet-line bg-fleet-paper/55 p-3">
        {store.items.map((item) => {
          const key = itemKey(store.name, item.name);
          const quantity = quantities[key] || 0;
          return (
            <article key={key} className="rounded-fleet border border-fleet-line bg-white p-2.5">
              <div className="grid grid-cols-[48px_1fr] items-start gap-2">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.name} width={48} height={48} sizes="48px" quality={60} loading="lazy" className="h-12 w-12 rounded-fleet object-cover" />
                ) : (
                  <span className="h-12 w-12 rounded-fleet bg-fleet-paper" />
                )}
                <span className="min-w-0">
                  <strong className="line-clamp-1 block text-xs font-black text-fleet-night">{item.name}</strong>
                  <span className="mt-0.5 block text-[0.68rem] font-bold text-slate-500">{item.type} · {item.portion || "1 portion"}</span>
                  <strong className="mt-1 block text-xs font-black text-fleet-ember">{formatMoney(item.price)}</strong>
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1 rounded-fleet bg-fleet-paper p-1">
                  <button type="button" onClick={() => onQuantity(key, -1)} className="grid h-8 w-8 place-items-center rounded-fleet text-fleet-night" aria-label={`Remove ${item.name}`}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-7 text-center text-xs font-black text-fleet-night">{quantity}</span>
                  <button type="button" onClick={() => onQuantity(key, 1)} className="grid h-8 w-8 place-items-center rounded-fleet bg-fleet-night text-white" aria-label={`Add ${item.name}`}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-xs font-black text-fleet-night">{formatMoney(quantity * item.price)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </motion.details>
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
