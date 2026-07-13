"use client";

import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Loader2, MapPin, MessageCircle, Minus, Plus, ShoppingCart } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AddressAutocompleteInput } from "@/components/location/address-autocomplete-input";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format";
import { PLATFORM_CHECKOUT_FEE_NGN } from "@/lib/fare";
import { cn } from "@/lib/cn";
import {
  buildShoppingCategoryGroups,
  defaultShoppingMalls,
  getShoppingStoreImage,
  mallMenuStorageKey,
  normalizeShoppingMalls
} from "@/lib/mall-menu";
import type { MallCategory, MallProduct, MallStore, ShoppingCategoryGroup, ShoppingMall } from "@/lib/mall-menu";
import { useMarketplaceEstimate } from "@/components/marketplace/use-marketplace-estimate";

type CartItem = {
  productId: string;
  productName: string;
  mallId: string;
  mallName: string;
  vendorId: string;
  vendorName: string;
  businessId?: string;
  pickupAddress: string;
  category: MallCategory;
  price: number;
  quantity: number;
  subtotal: number;
};

export function MallMarketplace({ initialMalls = defaultShoppingMalls }: { initialMalls?: ShoppingMall[] } = {}) {
  const [malls, setMalls] = useState<ShoppingMall[]>(initialMalls);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const categoryRefs = useRef<Array<HTMLElement | null>>([]);
  const reduceMotion = useReducedMotion();

  const categoryGroups = useMemo(() => buildShoppingCategoryGroups(malls), [malls]);
  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const checkoutItems = useMemo(
    () =>
      cartItems.map((item) => ({
        ...item,
        name: item.productName,
        store: `${item.category} · ${item.vendorName}`,
        mallLocation: item.pickupAddress
      })),
    [cartItems]
  );
  const { estimate, loading: estimateLoading, error: estimateError } = useMarketplaceEstimate({ kind: "shopping", address, items: checkoutItems });
  const productsTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const platformFee = estimate?.platformFee ?? PLATFORM_CHECKOUT_FEE_NGN;
  const deliveryFee = estimate?.deliveryFee ?? 0;
  const finalTotal = estimate?.total ?? productsTotal + platformFee;

  useEffect(() => {
    function applyStoredMalls() {
      try {
        const stored = window.localStorage.getItem(mallMenuStorageKey);
        if (stored) setMalls(normalizeShoppingMalls(JSON.parse(stored)));
      } catch {
        // Keep bundled mall data if local fallback data is malformed.
      }
    }

    window.addEventListener("storage", applyStoredMalls);
    return () => window.removeEventListener("storage", applyStoredMalls);
  }, []);

  useEffect(() => {
    setMalls(initialMalls);
    try {
      window.localStorage.setItem(mallMenuStorageKey, JSON.stringify(initialMalls));
    } catch {
      // Browser storage is optional; the server-loaded menu is still the source of truth.
    }
  }, [initialMalls]);

  function changeQuantity(mall: ShoppingMall, vendor: MallStore, product: MallProduct, delta: number) {
    if (typeof product.price !== "number") return;
    const price = product.price;
    setCart((current) => {
      const key = cartKey(mall.id, vendor.id, product.id);
      const quantity = Math.max(0, (current[key]?.quantity || 0) + delta);
      const next = { ...current };
      if (quantity === 0) {
        delete next[key];
        return next;
      }
      next[key] = {
        productId: product.id,
        productName: product.name,
        mallId: mall.id,
        mallName: mall.name,
        vendorId: vendor.id,
        vendorName: vendor.name,
        businessId: product.businessId || vendor.businessId,
        pickupAddress: mall.location || mall.name,
        category: vendor.category,
        price,
        quantity,
        subtotal: price * quantity
      };
      return next;
    });
  }

  function handleCategoryScroll(event: UIEvent<HTMLDivElement>) {
    const firstCard = categoryRefs.current[0];
    if (!firstCard) return;
    const gap = 12;
    const nextIndex = Math.round(event.currentTarget.scrollLeft / (firstCard.offsetWidth + gap));
    setActiveCategory(Math.max(0, Math.min(categoryGroups.length - 1, nextIndex)));
  }

  function goToCategory(index: number) {
    categoryRefs.current[index]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "start", block: "nearest" });
    setActiveCategory(index);
  }

  function askPrice(product: MallProduct, vendor: MallStore, mall: ShoppingMall) {
    const text = encodeURIComponent(
      `Hello Fast Fleets 360, I want to ask the price of this shopping item.\n\nProduct: ${product.name}\nCategory: ${vendor.category}\nVendor/store: ${vendor.name}\nPickup area: ${mall.location || mall.name}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  async function checkout() {
    setMessage(null);
    if (!cartItems.length) {
      setMessage("Add at least one priced shopping product before checkout.");
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
          kind: "shopping",
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
            delivery_code: deliveryCode,
            pickup_address: cartItems.map((item) => `${item.vendorName} · ${item.pickupAddress}`).join(", "),
            dropoff_address: address,
            status: payload.status || (businessOrder ? "received" : "searching"),
            vehicle_type: "bike",
            delivery_speed: "same_day",
            price_ngn: estimate.total,
            distance_km: estimate.distanceKm,
            eta_minutes: estimate.etaMinutes,
            source: businessOrder ? "business_marketplace_order" : "shopping_mall_checkout",
            marketplace_kind: "shopping",
            items: cartItems.map(({ productName, quantity, vendorName }) => ({ name: productName, quantity, store: vendorName })),
            created_at: new Date().toISOString()
          },
          ...stored
        ])
      );
      window.location.assign(payload.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Shopping checkout failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <BackButton className="section-wrap pb-4 pt-4" />
    <CinematicPageHero
      eyebrow="Fast Fleets 360 Shopping"
      title="Shopping delivered cleanly."
      body="Choose a category, pick a vendor, add items, and checkout with Squad."
      image="https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=2200&q=84"
    />
    <section className="section-wrap -mt-8 pb-28 sm:-mt-10 sm:pb-12">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0">
          <div className="rounded-fleet border border-white/70 bg-white/80 p-4 shadow-lift backdrop-blur-xl sm:p-5">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Shopping checkout</span>
            <h2 className="mt-2 break-words text-2xl font-black leading-tight text-fleet-night sm:text-4xl">Choose a category. Add. Pay.</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
              Fast Fleets 360 estimates delivery after your address and adds a {formatMoney(platformFee)} platform fee.
            </p>
          </div>

          <div
            className="mt-8 flex w-full snap-x gap-3 overflow-x-auto pb-5 pr-4 [scrollbar-width:none] lg:grid lg:grid-cols-2 lg:gap-4 lg:overflow-visible lg:pr-0 xl:grid-cols-3 [&::-webkit-scrollbar]:hidden"
            onScroll={handleCategoryScroll}
          >
            {categoryGroups.map((group, index) => (
              <ShoppingCategoryCard
                key={group.category}
                group={group}
                index={index}
                cart={cart}
                reduceMotion={Boolean(reduceMotion)}
                onQuantity={changeQuantity}
                onAskPrice={askPrice}
                refCallback={(node) => {
                  categoryRefs.current[index] = node;
                }}
              />
            ))}
          </div>
          {categoryGroups.length > 1 ? (
            <div className="mt-1 flex justify-center gap-2 lg:hidden" aria-label="Shopping category pages">
              {categoryGroups.map((group, index) => (
                <button
                  key={group.category}
                  type="button"
                  aria-label={`Show ${group.category}`}
                  onClick={() => goToCategory(index)}
                  className={cn("h-2 rounded-full transition-all", activeCategory === index ? "w-6 bg-fleet-ember" : "w-2 bg-slate-300")}
                />
              ))}
            </div>
          ) : null}
        </div>

        <Card className="sticky top-24 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Shopping checkout</span>
              <strong className="mt-1 block text-3xl font-black text-fleet-night">{formatMoney(finalTotal)}</strong>
            </div>
            <StatusBadge tone="green">{cartItems.length} items</StatusBadge>
          </div>

          <div className="mt-5 grid gap-3">
            {cartItems.length === 0 ? <div className="rounded-fleet bg-fleet-paper p-3 text-sm font-bold text-slate-500">No priced shopping products selected yet.</div> : null}
            {cartItems.map((item) => (
              <div key={cartKey(item.mallId, item.vendorId, item.productId)} className="rounded-fleet bg-fleet-paper p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-black text-fleet-night">{item.productName}</strong>
                    <span className="text-xs font-bold text-slate-500">{item.quantity} item · {item.vendorName} · {item.category}</span>
                  </span>
                  <strong className="text-sm font-black text-fleet-night">{formatMoney(item.subtotal)}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-2 text-sm font-bold">
            <Summary label="Products" value={formatMoney(productsTotal)} />
            <Summary label="Delivery fee" value={estimateLoading ? "Estimating..." : estimate ? formatMoney(deliveryFee) : "Add address"} />
            <Summary label="Platform fee" value={formatMoney(platformFee)} />
            {estimate ? <Summary label="Route distance" value={`${estimate.distanceKm.toFixed(1)} km`} /> : null}
            <Summary label="Final total" value={formatMoney(finalTotal)} strong />
          </div>

          <div className="mt-5 grid gap-3">
            <input className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email for receipt" type="email" />
            <input className="form-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" inputMode="tel" />
            <AddressAutocompleteInput label="Delivery address" value={address} onChange={setAddress} placeholder="Enter recipient street address" />
            <Button type="button" onClick={checkout} disabled={loading || estimateLoading || cartItems.length === 0}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              Checkout Shopping Order
            </Button>
          </div>
          {message || estimateError ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{message || estimateError}</div> : null}
        </Card>
      </div>
    </section>
    </>
  );
}

function ShoppingCategoryCard({
  group,
  index,
  cart,
  reduceMotion,
  onQuantity,
  onAskPrice,
  refCallback
}: {
  group: ShoppingCategoryGroup;
  index: number;
  cart: Record<string, CartItem>;
  reduceMotion: boolean;
  onQuantity: (mall: ShoppingMall, vendor: MallStore, product: MallProduct, delta: number) => void;
  onAskPrice: (product: MallProduct, vendor: MallStore, mall: ShoppingMall) => void;
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
          <img src={group.image} alt={group.category} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-fleet-ember shadow-[0_10px_24px_rgba(8,17,31,0.12)]">
            {group.vendors.length} vendors
          </span>
        </div>
        <div className="p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <strong className="line-clamp-1 block text-base font-black leading-tight text-fleet-night">{group.category}</strong>
              <span className="mt-1 line-clamp-1 block text-xs font-bold leading-5 text-slate-500">{group.productCount} products from shopping vendors.</span>
            </span>
            <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-fleet-ember transition group-open:rotate-180" />
          </div>
          <span className="mt-3 flex items-start gap-1.5 text-xs font-bold leading-5 text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fleet-ember" />
            <span className="line-clamp-2">{group.locations.join(", ") || "Shopping pickup"}</span>
          </span>
          <span className="mt-4 inline-flex min-h-9 w-full items-center justify-center rounded-fleet bg-fleet-night px-3 text-xs font-black text-white transition group-hover:bg-fleet-ember">
            View vendors
          </span>
        </div>
      </summary>
      <div className="grid max-h-[520px] gap-3 overflow-y-auto border-t border-fleet-line bg-fleet-paper/55 p-3">
        {group.vendors.map(({ mall, store: vendor }) => (
          <details key={`${mall.id}:${vendor.id}`} className="group/vendor overflow-hidden rounded-fleet border border-fleet-line bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <div className="grid min-w-0 grid-cols-[44px_1fr] items-center gap-3">
                <img src={getShoppingStoreImage(vendor, mall)} alt={vendor.name} loading="lazy" className="h-11 w-11 rounded-fleet object-cover" />
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-black text-fleet-night">{vendor.name}</strong>
                  <span className="mt-1 block text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">{vendor.products.length} products · {mall.location || mall.name}</span>
                </span>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-fleet-ember transition group-open/vendor:rotate-180" />
            </summary>
            <div className="grid gap-2 border-t border-fleet-line bg-fleet-paper/70 p-2.5">
              {vendor.products.map((product) => {
                const key = cartKey(mall.id, vendor.id, product.id);
                const quantity = cart[key]?.quantity || 0;
                const price = typeof product.price === "number" ? product.price : null;
                const canBuy = product.available && price !== null;
                return (
                  <article key={key} className="rounded-fleet border border-fleet-line bg-white p-2.5">
                    <div className="grid grid-cols-[48px_1fr] items-start gap-2">
                      <img src={product.image} alt={product.name} loading="lazy" className="h-12 w-12 rounded-fleet object-cover" />
                      <span className="min-w-0">
                        <strong className="line-clamp-1 block text-xs font-black text-fleet-night">{product.name}</strong>
                        <span className="mt-0.5 block text-[0.68rem] font-bold text-slate-500">{vendor.name} · {price !== null ? formatMoney(price) : "Ask price"}</span>
                      </span>
                    </div>
                    {canBuy ? (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1 rounded-fleet bg-fleet-paper p-1">
                          <button type="button" onClick={() => onQuantity(mall, vendor, product, -1)} className="grid h-8 w-8 place-items-center rounded-fleet text-fleet-night" aria-label={`Remove ${product.name}`}>
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-7 text-center text-xs font-black text-fleet-night">{quantity}</span>
                          <button type="button" onClick={() => onQuantity(mall, vendor, product, 1)} className="grid h-8 w-8 place-items-center rounded-fleet bg-fleet-night text-white" aria-label={`Add ${product.name}`}>
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Button type="button" size="sm" onClick={() => onQuantity(mall, vendor, product, 1)}>
                          <ShoppingCart className="h-4 w-4" />
                          Add
                        </Button>
                      </div>
                    ) : (
                      <Button type="button" size="sm" variant="dark" onClick={() => onAskPrice(product, vendor, mall)} className="mt-3 w-full">
                        <MessageCircle className="h-4 w-4" />
                        Ask Price
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </motion.details>
  );
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-fleet px-3 py-2", strong ? "bg-fleet-night text-white" : "bg-fleet-paper")}>
      <span className={strong ? "text-white/75" : "text-slate-500"}>{label}</span>
      <strong className={strong ? "text-white" : "text-fleet-night"}>{value}</strong>
    </div>
  );
}

function cartKey(mallId: string, vendorId: string, productId: string) {
  return `${mallId}:${vendorId}:${productId}`;
}
