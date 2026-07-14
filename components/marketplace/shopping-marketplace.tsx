"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, MapPin, MessageCircle, Minus, Plus, ShoppingBag, ShoppingCart } from "lucide-react";
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
              decoding="async"
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
                    <img src={meta.image || group.image} alt={meta.label} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
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
  return <ShoppingCategoryVendorSelection initialMalls={initialMalls} category={category} />;
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

function ShoppingCategoryVendorSelection({ initialMalls, category }: { initialMalls: ShoppingMall[]; category: MallCategory }) {
  const malls = useLiveShoppingMalls(initialMalls);
  const categoryGroup = useMemo(() => findShoppingCategoryGroup(malls, category), [category, malls]);
  const vendors = categoryGroup?.vendors || [];
  const meta = shoppingCategoryMeta[category];
  const heroImage = categoryGroup?.image || meta.image;
  const productCount = categoryGroup?.productCount || 0;

  return (
    <>
      <BackButton className="section-wrap pb-4 pt-4" />
      <section className="section-wrap pb-28 pt-2 sm:pb-14">
        <div className="overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-lift">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="p-4 sm:p-5 lg:p-6">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Shopping vendors</span>
              <h1 className="mt-2 text-2xl font-black leading-tight text-fleet-night sm:text-4xl">{meta.label} vendors.</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">{meta.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge tone="green">{vendors.length} vendors</StatusBadge>
                <StatusBadge tone="neutral">{productCount} products</StatusBadge>
              </div>
            </div>
            <img src={heroImage} alt={`${meta.label} vendors`} loading="eager" decoding="async" className="hidden h-full min-h-[190px] w-full object-cover lg:block" />
          </div>
        </div>

        {vendors.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {vendors.map((vendor) => (
              <ShoppingCategoryVendorCard key={`${vendor.mall.id}:${vendor.store.id}`} vendor={vendor} />
            ))}
          </div>
        ) : (
          <Card className="mt-5 p-5">
            <h2 className="text-xl font-black text-fleet-night">No vendors yet</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">This shopping category has no active vendors yet.</p>
            <Link href="/shopping" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-fleet bg-fleet-night px-4 text-sm font-black text-white">
              Back to Shopping
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        )}
      </section>
    </>
  );
}

function ShoppingCategoryVendorCard({ vendor }: { vendor: ShoppingCategoryVendor }) {
  const { mall, store } = vendor;
  const vendorImage = getShoppingStoreImage(store, mall);
  const productCount = store.products.length;

  return (
    <Link href={shoppingVendorCategoryPath(store)} className="group block focus:outline-none focus:ring-2 focus:ring-fleet-ember">
      <article className="overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_8px_18px_rgba(8,17,31,0.06)] transition hover:-translate-y-1 hover:border-fleet-ember">
        <div className="relative h-28 overflow-hidden bg-fleet-paper">
          <img src={vendorImage} alt={store.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[0.6rem] font-black uppercase tracking-[0.1em] text-fleet-ember">
            {shoppingCategoryLabel(store.category)}
          </span>
        </div>
        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <strong className="line-clamp-1 block text-base font-black leading-tight text-fleet-night">{store.name}</strong>
              <span className="mt-1 flex items-start gap-1.5 text-xs font-bold leading-5 text-slate-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fleet-ember" />
                <span className="line-clamp-2">{mall.location || mall.name}</span>
              </span>
            </span>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-fleet-ember transition group-hover:translate-x-0.5" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[0.65rem] font-black text-slate-500">
            <span className="rounded-full bg-fleet-paper px-2 py-1">
              {productCount} product{productCount === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-fleet-paper px-2 py-1">Open menu</span>
          </div>
        </div>
      </article>
    </Link>
  );
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
  const [activeVendorFilter, setActiveVendorFilter] = useState("all");
  const checkoutRef = useRef<HTMLDivElement | null>(null);

  const selectedVendor = useMemo(() => (vendorId ? findShoppingVendor(malls, vendorId, category) : null), [category, malls, vendorId]);
  const missingVendor = Boolean(vendorId && !selectedVendor);
  const categoryGroup = useMemo(() => (category ? findShoppingCategoryGroup(malls, category) : null), [category, malls]);
  const visibleGroups = useMemo(() => {
    if (selectedVendor) return [groupForVendor(selectedVendor)];
    if (missingVendor) return [];
    if (categoryGroup) return [categoryGroup];
    return buildShoppingCategoryGroups(malls);
  }, [categoryGroup, malls, missingVendor, selectedVendor]);
  const vendors = useMemo(() => visibleGroups.flatMap((group) => group.vendors), [visibleGroups]);
  const vendorFilters = useMemo(
    () => [
      { id: "all", label: "All Items" },
      ...vendors.map((vendor) => ({ id: vendorKey(vendor), label: vendor.store.name }))
    ],
    [vendors]
  );
  const displayedVendors = useMemo(
    () => (activeVendorFilter === "all" || selectedVendor ? vendors : vendors.filter((vendor) => vendorKey(vendor) === activeVendorFilter)),
    [activeVendorFilter, selectedVendor, vendors]
  );
  const displayedProductCount = displayedVendors.reduce((count, vendor) => count + vendor.store.products.length, 0);

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
  const pageTitle = missingVendor ? "Vendor not found" : selectedVendor ? `${selectedVendor.store.name} storefront` : `${meta.label} vendors`;
  const pageBody = selectedVendor
    ? `Order directly from ${selectedVendor.store.name}. This advert link opens the vendor storefront without changing the existing checkout flow.`
    : missingVendor
      ? "This shopping vendor link is no longer active."
    : `Choose a ${meta.label.toLowerCase()} vendor, open their products, add items, and checkout with Squad.`;

  useEffect(() => {
    if (selectedVendor) {
      setActiveVendorFilter("all");
      return;
    }
    if (activeVendorFilter !== "all" && !vendorFilters.some((filter) => filter.id === activeVendorFilter)) setActiveVendorFilter("all");
  }, [activeVendorFilter, selectedVendor, vendorFilters]);

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
            <img src={heroImage} alt={pageTitle} loading="eager" decoding="async" className="hidden h-full min-h-[180px] w-full object-cover md:block" />
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
                <StatusBadge tone="green">{displayedProductCount} products</StatusBadge>
              </div>
              {!selectedVendor && vendorFilters.length > 2 ? (
                <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
                  {vendorFilters.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setActiveVendorFilter(filter.id)}
                      className={cn(
                        "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-black transition",
                        activeVendorFilter === filter.id ? "bg-fleet-ember text-white shadow-[0_12px_26px_rgba(244,126,24,0.20)]" : "bg-fleet-paper text-fleet-night hover:bg-white hover:shadow-[0_10px_24px_rgba(8,17,31,0.08)]"
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              ) : null}
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
              <div className="mt-5 grid gap-4">
                {displayedVendors.map((vendor) => (
                  <ShoppingVendorMenuSection
                    key={`${vendor.mall.id}:${vendor.store.id}`}
                    vendor={vendor}
                    cart={cart}
                    showVendorLink={!selectedVendor}
                    onQuantity={changeQuantity}
                    onAskPrice={askPrice}
                  />
                ))}
              </div>
            )}
          </div>

          <div ref={checkoutRef}>
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
        </div>
        <MobileCartBar count={cartItems.length} total={finalTotal} label="Your Order" onOpen={() => checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
      </section>
    </>
  );
}

function ShoppingVendorMenuSection({
  vendor,
  cart,
  showVendorLink,
  onQuantity,
  onAskPrice
}: {
  vendor: ShoppingCategoryVendor;
  cart: Record<string, CartItem>;
  showVendorLink: boolean;
  onQuantity: (mall: ShoppingMall, vendor: MallStore, product: MallProduct, delta: number) => void;
  onAskPrice: (product: MallProduct, vendor: MallStore, mall: ShoppingMall) => void;
}) {
  const { mall, store } = vendor;
  const vendorImage = getShoppingStoreImage(store, mall);
  const categoryLabel = shoppingCategoryLabel(store.category);

  return (
    <section className="overflow-hidden rounded-[20px] border border-fleet-line bg-white shadow-[0_12px_28px_rgba(8,17,31,0.07)]">
      <div className="grid gap-0 md:grid-cols-[190px_1fr]">
        <div className="relative h-36 overflow-hidden bg-fleet-paper md:h-full">
          <img src={vendorImage} alt={store.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-fleet-ember shadow-[0_10px_24px_rgba(8,17,31,0.12)]">
            {categoryLabel}
          </span>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="break-words text-xl font-black leading-tight text-fleet-night">{store.name}</h3>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{store.products.length} products available</p>
            </div>
            {showVendorLink ? (
              <Link href={shoppingVendorCategoryPath(store)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-fleet border border-fleet-line bg-white px-3 text-xs font-black text-fleet-night transition hover:border-fleet-ember">
                Open vendor page
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
          <span className="mt-3 flex items-start gap-1.5 text-xs font-bold leading-5 text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fleet-ember" />
            <span className="line-clamp-2">{mall.location || mall.name}</span>
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 border-t border-fleet-line bg-fleet-paper/55 p-2.5 sm:gap-3 sm:p-3 md:grid-cols-3 xl:grid-cols-4">
        {store.products.map((product) => {
          const key = cartKey(mall.id, store.id, product.id);
          const quantity = cart[key]?.quantity || 0;
          const price = typeof product.price === "number" ? product.price : null;
          const canBuy = product.available && price !== null;
          return (
            <article key={key} className="flex min-h-full flex-col overflow-hidden rounded-[16px] border border-fleet-line bg-white shadow-[0_8px_18px_rgba(8,17,31,0.05)] transition hover:border-fleet-ember">
              <img src={product.image || vendorImage} alt={product.name} loading="lazy" decoding="async" className="h-24 w-full object-cover sm:h-28" />
              <div className="flex flex-1 flex-col p-2.5">
                <span className="w-fit rounded-full bg-fleet-paper px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-[0.1em] text-fleet-ember">{categoryLabel}</span>
                <h4 className="mt-1.5 line-clamp-2 min-h-[2.25rem] break-words text-sm font-black leading-tight text-fleet-night">{product.name}</h4>
                <p className="mt-1 line-clamp-1 text-[0.7rem] font-bold leading-4 text-slate-500">{store.name}</p>
                <strong className="mt-2 block text-base font-black text-fleet-ember">{price !== null ? formatMoney(price) : "Ask price"}</strong>
              {canBuy ? (
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <div className="inline-flex h-9 items-center rounded-[12px] bg-fleet-paper p-0.5">
                    <button type="button" onClick={() => onQuantity(mall, store, product, -1)} className="grid h-8 w-8 place-items-center rounded-[10px] text-fleet-night" aria-label={`Remove ${product.name}`}>
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-7 text-center text-xs font-black text-fleet-night">{quantity}</span>
                    <button type="button" onClick={() => onQuantity(mall, store, product, 1)} className="grid h-8 w-8 place-items-center rounded-[10px] bg-fleet-night text-white shadow-[0_8px_18px_rgba(8,17,31,0.16)]" aria-label={`Add ${product.name}`}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-xs font-black text-fleet-night">{formatMoney(quantity * Number(price || 0))}</span>
                </div>
              ) : (
                <Button type="button" size="sm" variant="dark" onClick={() => onAskPrice(product, store, mall)} className="mt-auto w-full justify-center">
                  <MessageCircle className="h-4 w-4" />
                  Ask Price
                </Button>
              )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
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

function vendorKey(vendor: ShoppingCategoryVendor) {
  return `${vendor.mall.id}:${vendor.store.id}`;
}
