"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ExternalLink, Loader2, MapPin, MessageCircle, Minus, Plus, ShoppingBag, ShoppingCart } from "lucide-react";
import { AddressAutocompleteInput } from "@/components/location/address-autocomplete-input";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMarketplaceEstimate } from "@/components/marketplace/use-marketplace-estimate";
import { cn } from "@/lib/cn";
import { PLATFORM_CHECKOUT_FEE_NGN } from "@/lib/fare";
import { formatMoney } from "@/lib/format";
import {
  buildShoppingCategoryGroups,
  defaultShoppingMalls,
  findShoppingCategoryGroup,
  findShoppingVendor,
  getShoppingStoreImage,
  mallMenuStorageKey,
  normalizeShoppingMalls,
  shoppingCategoryLabel,
  shoppingCategoryMeta,
  shoppingCategoryPath,
  shoppingVendorCategoryPath
} from "@/lib/mall-menu";
import type { MallCategory, MallProduct, MallStore, ShoppingCategoryGroup, ShoppingCategoryVendor, ShoppingMall } from "@/lib/mall-menu";

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

export function ShoppingCategorySelection({ initialMalls = defaultShoppingMalls }: { initialMalls?: ShoppingMall[] } = {}) {
  const malls = useLiveShoppingMalls(initialMalls);
  const categoryGroups = useMemo(() => buildShoppingCategoryGroups(malls), [malls]);
  const vendorCount = categoryGroups.reduce((count, group) => count + group.vendors.length, 0);
  const productCount = categoryGroups.reduce((count, group) => count + group.productCount, 0);

  return (
    <>
      <BackButton className="section-wrap pb-4 pt-4" />
      <section className="section-wrap pb-28 pt-2 sm:pb-14">
        <div className="overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-lift">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="p-4 sm:p-5 lg:p-6">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Shopping categories</span>
                <h1 className="mt-2 text-2xl font-black leading-tight text-fleet-night sm:text-4xl">Choose a shopping category.</h1>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                  {vendorCount} vendors and {productCount} products are grouped so customers reach the right storefront faster.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge tone="green">{categoryGroups.length} categories</StatusBadge>
                <StatusBadge tone="neutral">{vendorCount} vendors</StatusBadge>
              </div>
            </div>
            <img
              src="https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=900&q=72"
              alt="Shopping delivery"
              loading="eager"
              className="hidden h-full min-h-[190px] w-full object-cover lg:block"
            />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {categoryGroups.map((group) => {
            const meta = shoppingCategoryMeta[group.category];
            return (
              <Link key={group.category} href={shoppingCategoryPath(group.category)} className="group block focus:outline-none focus:ring-2 focus:ring-fleet-ember">
                <article className="overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_10px_24px_rgba(8,17,31,0.08)] transition hover:-translate-y-1 hover:border-fleet-ember">
                  <div className="relative h-24 overflow-hidden bg-fleet-paper sm:h-28">
                    <img src={meta.image || group.image} alt={meta.label} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[0.58rem] font-black uppercase tracking-[0.1em] text-fleet-ember">
                      <ShoppingBag className="h-3.5 w-3.5" />
                      {group.vendors.length}
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <strong className="block text-base font-black leading-tight text-fleet-night">{meta.label}</strong>
                        <span className="mt-1 line-clamp-2 block text-xs font-bold leading-5 text-slate-500">{meta.eyebrow}</span>
                      </span>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-fleet-ember transition group-hover:translate-x-0.5" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[0.65rem] font-black text-slate-500">
                      <span className="rounded-full bg-fleet-paper px-2 py-1">{group.vendors.length} vendors</span>
                      <span className="rounded-full bg-fleet-paper px-2 py-1">{group.productCount} products</span>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

export function ShoppingCategoryMarketplace({ initialMalls = defaultShoppingMalls, category }: { initialMalls?: ShoppingMall[]; category: MallCategory }) {
  return <ShoppingStorefront initialMalls={initialMalls} category={category} />;
}

export function ShoppingVendorMarketplace({
  initialMalls = defaultShoppingMalls,
  category,
  vendorId
}: {
  initialMalls?: ShoppingMall[];
  category?: MallCategory | null;
  vendorId: string;
}) {
  return <ShoppingStorefront initialMalls={initialMalls} category={category} vendorId={vendorId} />;
}

export function MallMarketplace({ initialMalls = defaultShoppingMalls }: { initialMalls?: ShoppingMall[] } = {}) {
  return <ShoppingCategorySelection initialMalls={initialMalls} />;
}

function ShoppingStorefront({
  initialMalls,
  category,
  vendorId
}: {
  initialMalls: ShoppingMall[];
  category?: MallCategory | null;
  vendorId?: string;
}) {
  const malls = useLiveShoppingMalls(initialMalls);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedVendor = useMemo(() => (vendorId ? findShoppingVendor(malls, vendorId, category) : null), [category, malls, vendorId]);
  const categoryGroup = useMemo(() => (category ? findShoppingCategoryGroup(malls, category) : null), [category, malls]);
  const visibleGroups = useMemo(() => {
    if (selectedVendor) return [groupForVendor(selectedVendor)];
    if (categoryGroup) return [categoryGroup];
    return buildShoppingCategoryGroups(malls);
  }, [categoryGroup, malls, selectedVendor]);
  const vendors = visibleGroups.flatMap((group) => group.vendors);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const checkoutItems = useMemo(
    () =>
      cartItems.map((item) => ({
        ...item,
        name: item.productName,
        store: `${shoppingCategoryLabel(item.category)} · ${item.vendorName}`,
        mallLocation: item.pickupAddress
      })),
    [cartItems]
  );
  const { estimate, loading: estimateLoading, error: estimateError } = useMarketplaceEstimate({ kind: "shopping", address, items: checkoutItems });
  const productsTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const platformFee = estimate?.platformFee ?? PLATFORM_CHECKOUT_FEE_NGN;
  const deliveryFee = estimate?.deliveryFee ?? 0;
  const finalTotal = estimate?.total ?? productsTotal + platformFee;
  const activeCategory = selectedVendor?.store.category || category || visibleGroups[0]?.category || "Grocery";
  const meta = shoppingCategoryMeta[activeCategory];
  const heroImage = selectedVendor ? getShoppingStoreImage(selectedVendor.store, selectedVendor.mall) : categoryGroup?.image || meta.image;
  const pageTitle = selectedVendor ? `${selectedVendor.store.name} storefront` : `${meta.label} vendors`;
  const pageBody = selectedVendor
    ? `Order directly from ${selectedVendor.store.name}. This advert link opens the vendor storefront without changing the existing checkout flow.`
    : `Choose a ${meta.label.toLowerCase()} vendor, open their products, add items, and checkout with Squad.`;

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

  function askPrice(product: MallProduct, vendor: MallStore, mall: ShoppingMall) {
    const text = encodeURIComponent(
      `Hello Fast Fleets 360, I want to ask the price of this shopping item.\n\nProduct: ${product.name}\nCategory: ${shoppingCategoryLabel(vendor.category)}\nVendor/store: ${vendor.name}\nPickup area: ${mall.location || mall.name}`
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
            user_id: payload.userId || null,
            customer_id: payload.userId || null,
            delivery_code: deliveryCode,
            pickup_address: cartItems.map((item) => `${item.vendorName} · ${item.pickupAddress}`).join(", "),
            dropoff_address: address,
            status: payload.status || (businessOrder ? "received" : "searching"),
            vehicle_type: "bike",
            vehicle_subtype: payload.vehicleSubtype || null,
            delivery_speed: "same_day",
            price_ngn: estimate.total,
            distance_km: estimate.distanceKm,
            eta_minutes: estimate.etaMinutes,
            metadata: { vehicle_subtype: payload.vehicleSubtype || null },
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
      <section className="section-wrap pb-28 pt-2 sm:pb-12">
        <div className="mb-5 overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-lift">
          <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="p-4 sm:p-5">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">
                {selectedVendor ? `${meta.label} vendor` : "Fast Fleets 360 Shopping"}
              </span>
              <h1 className="mt-2 break-words text-2xl font-black leading-tight text-fleet-night sm:text-4xl">{pageTitle}</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">{pageBody}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge tone="green">{vendors.length} vendors</StatusBadge>
                <StatusBadge tone="neutral">{cartItems.length} selected</StatusBadge>
              </div>
            </div>
            <img src={heroImage} alt={pageTitle} loading="eager" className="hidden h-full min-h-[180px] w-full object-cover md:block" />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0">
            <div className="rounded-fleet border border-fleet-line bg-white p-4 shadow-[0_10px_24px_rgba(8,17,31,0.06)] sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">
                    {selectedVendor ? "Direct vendor marketplace" : `${meta.label} category`}
                  </span>
                  <h2 className="mt-2 break-words text-xl font-black leading-tight text-fleet-night sm:text-2xl">
                    {selectedVendor ? "Add items from this vendor." : "Choose a vendor."}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                    Fast Fleets 360 estimates delivery after your address and adds a {formatMoney(platformFee)} platform fee.
                  </p>
                </div>
                <StatusBadge tone="green">{vendors.length} vendors</StatusBadge>
              </div>
            </div>

            {vendors.length === 0 ? (
              <Card className="mt-6 p-5">
                <h3 className="text-xl font-black text-fleet-night">No vendors yet</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">This shopping category has no active vendors yet.</p>
                <Link href="/shopping" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-fleet bg-fleet-night px-4 text-sm font-black text-white">
                  Back to Shopping
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Card>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleGroups.flatMap((group) =>
                  group.vendors.map((vendor) => (
                    <ShoppingVendorCard
                      key={`${vendor.mall.id}:${vendor.store.id}`}
                      vendor={vendor}
                      cart={cart}
                      defaultOpen={Boolean(selectedVendor)}
                      showVendorLink={!selectedVendor}
                      onQuantity={changeQuantity}
                      onAskPrice={askPrice}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          <Card className="p-4 sm:p-5 lg:sticky lg:top-24">
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
                      <span className="text-xs font-bold text-slate-500">{item.quantity} item · {item.vendorName} · {shoppingCategoryLabel(item.category)}</span>
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

function ShoppingVendorCard({
  vendor,
  cart,
  defaultOpen,
  showVendorLink,
  onQuantity,
  onAskPrice
}: {
  vendor: ShoppingCategoryVendor;
  cart: Record<string, CartItem>;
  defaultOpen: boolean;
  showVendorLink: boolean;
  onQuantity: (mall: ShoppingMall, vendor: MallStore, product: MallProduct, delta: number) => void;
  onAskPrice: (product: MallProduct, vendor: MallStore, mall: ShoppingMall) => void;
}) {
  const { mall, store } = vendor;
  const vendorImage = getShoppingStoreImage(store, mall);
  const categoryLabel = shoppingCategoryLabel(store.category);
  const [expanded, setExpanded] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setExpanded(true);
  }, [defaultOpen]);

  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="group overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_8px_18px_rgba(8,17,31,0.06)] transition duration-200 hover:border-fleet-ember"
    >
      <summary className="block cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden">
        <div className="relative aspect-[16/10] overflow-hidden bg-fleet-paper">
          <img src={vendorImage} alt={store.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-fleet-ember shadow-[0_10px_24px_rgba(8,17,31,0.12)]">
            {categoryLabel}
          </span>
        </div>
        <div className="p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <strong className="line-clamp-1 block text-base font-black leading-tight text-fleet-night">{store.name}</strong>
              <span className="mt-1 line-clamp-1 block text-xs font-bold leading-5 text-slate-500">{store.products.length} products available</span>
            </span>
            <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-fleet-ember transition group-open:rotate-180" />
          </div>
          <span className="mt-3 flex items-start gap-1.5 text-xs font-bold leading-5 text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fleet-ember" />
            <span className="line-clamp-2">{mall.location || mall.name}</span>
          </span>
          <div className="mt-4 grid gap-2">
            <span className="inline-flex min-h-9 w-full items-center justify-center rounded-fleet bg-fleet-night px-3 text-xs font-black text-white transition group-hover:bg-fleet-ember">
              View products
            </span>
            {showVendorLink ? (
              <Link
                href={shoppingVendorCategoryPath(store)}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-fleet border border-fleet-line bg-white px-3 text-xs font-black text-fleet-night transition hover:border-fleet-ember"
              >
                Open vendor page
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      </summary>
      {expanded ? <div className="grid max-h-[420px] gap-2 overflow-y-auto border-t border-fleet-line bg-fleet-paper/55 p-3">
        {store.products.map((product) => {
          const key = cartKey(mall.id, store.id, product.id);
          const quantity = cart[key]?.quantity || 0;
          const price = typeof product.price === "number" ? product.price : null;
          const canBuy = product.available && price !== null;
          return (
            <article key={key} className="rounded-fleet border border-fleet-line bg-white p-2.5">
              <div className="grid grid-cols-[56px_1fr] items-start gap-2">
                <img src={product.image} alt={product.name} loading="lazy" className="h-14 w-14 rounded-fleet object-cover" />
                <span className="min-w-0">
                  <strong className="line-clamp-1 block text-xs font-black text-fleet-night">{product.name}</strong>
                  <span className="mt-0.5 block text-[0.68rem] font-bold text-slate-500">{store.name} · {price !== null ? formatMoney(price) : "Ask price"}</span>
                </span>
              </div>
              {canBuy ? (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1 rounded-fleet bg-fleet-paper p-1">
                    <button type="button" onClick={() => onQuantity(mall, store, product, -1)} className="grid h-8 w-8 place-items-center rounded-fleet text-fleet-night" aria-label={`Remove ${product.name}`}>
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-7 text-center text-xs font-black text-fleet-night">{quantity}</span>
                    <button type="button" onClick={() => onQuantity(mall, store, product, 1)} className="grid h-8 w-8 place-items-center rounded-fleet bg-fleet-night text-white" aria-label={`Add ${product.name}`}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Button type="button" size="sm" onClick={() => onQuantity(mall, store, product, 1)}>
                    <ShoppingCart className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="dark" onClick={() => onAskPrice(product, store, mall)} className="mt-3 w-full">
                  <MessageCircle className="h-4 w-4" />
                  Ask Price
                </Button>
              )}
            </article>
          );
        })}
      </div> : null}
    </details>
  );
}

function useLiveShoppingMalls(initialMalls: ShoppingMall[]) {
  const [malls, setMalls] = useState<ShoppingMall[]>(initialMalls);

  useEffect(() => {
    function applyStoredMalls() {
      try {
        const stored = window.localStorage.getItem(mallMenuStorageKey);
        if (stored) setMalls(normalizeShoppingMalls(JSON.parse(stored)));
      } catch {
        // Keep bundled shopping data if local fallback data is malformed.
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

  return malls;
}

function groupForVendor(vendor: ShoppingCategoryVendor): ShoppingCategoryGroup {
  return {
    category: vendor.store.category,
    vendors: [vendor],
    productCount: vendor.store.products.length,
    image: getShoppingStoreImage(vendor.store, vendor.mall),
    locations: [vendor.mall.location || vendor.mall.name].filter(Boolean)
  };
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
