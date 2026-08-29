"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, MapPin, MessageCircle, Minus, Plus, ShoppingBag, ShoppingCart } from "lucide-react";
import { AddressAutocompleteInput } from "@/components/location/address-autocomplete-input";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMarketplaceVehicleOptions, type MarketplaceVehicleOption } from "@/components/marketplace/use-marketplace-vehicle-options";
import { LightVehicleOptions } from "@/components/booking/light-vehicle-options";
import { cn } from "@/lib/cn";
import { PLATFORM_CHECKOUT_FEE_NGN } from "@/lib/fare";
import { formatMoney } from "@/lib/format";
import { vendorIsOpen, vendorStatusLabel } from "@/lib/vendor-presentation";
import {
  buildShoppingCategoryGroups,
  defaultShoppingMalls,
  findShoppingCategoryGroup,
  findShoppingVendor,
  getShoppingStoreImage,
  mallMenuStorageKey,
  normalizeShoppingMalls,
  shoppingProductPrice,
  shoppingProductTypes,
  shoppingCategoryLabel,
  shoppingCategoryMeta,
  shoppingCategoryPath,
  shoppingVendorCategoryPath
} from "@/lib/mall-menu";
import type { MallCategory, MallProduct, MallStore, MallStoreLocation, ShoppingCategoryGroup, ShoppingCategoryVendor, ShoppingMall } from "@/lib/mall-menu";

type CartItem = {
  productId: string;
  productName: string;
  mallId: string;
  mallName: string;
  vendorId: string;
  vendorName: string;
  businessId?: string;
  pickupAddress: string;
  pickupPlaceId?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupNote?: string;
  vendorState: string;
  category: MallCategory;
  price: number;
  quantity: number;
  subtotal: number;
};

export function ShoppingCategorySelection({ initialMalls = defaultShoppingMalls, customerState }: { initialMalls?: ShoppingMall[]; customerState?: string | null } = {}) {
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
                {customerState ? <StatusBadge tone="blue">{customerState} vendors first</StatusBadge> : null}
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

export function ShoppingCategoryMarketplace({ initialMalls = defaultShoppingMalls, category, customerState }: { initialMalls?: ShoppingMall[]; category: MallCategory; customerState?: string | null }) {
  return <ShoppingCategoryVendorSelection initialMalls={initialMalls} category={category} customerState={customerState} />;
}

export function ShoppingVendorMarketplace({
  initialMalls = defaultShoppingMalls,
  category,
  vendorId,
  state
}: {
  initialMalls?: ShoppingMall[];
  category?: MallCategory | null;
  vendorId: string;
  state?: string | null;
}) {
  return <ShoppingStorefront initialMalls={initialMalls} category={category} vendorId={vendorId} state={state} />;
}

export function MallMarketplace({ initialMalls = defaultShoppingMalls }: { initialMalls?: ShoppingMall[] } = {}) {
  return <ShoppingCategorySelection initialMalls={initialMalls} />;
}

function ShoppingCategoryVendorSelection({ initialMalls, category, customerState }: { initialMalls: ShoppingMall[]; category: MallCategory; customerState?: string | null }) {
  const malls = useLiveShoppingMalls(initialMalls);
  const categoryGroup = useMemo(() => findShoppingCategoryGroup(malls, category), [category, malls]);
  const vendors = useMemo(() => sortVendorsByState(categoryGroup?.vendors || [], customerState), [categoryGroup?.vendors, customerState]);
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
    <Link href={shoppingVendorCategoryPath(store, vendor.location)} className="group block focus:outline-none focus:ring-2 focus:ring-fleet-ember">
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
                <span className="line-clamp-2">{vendor.location.pickupAddress || `${vendor.location.state} · ${mall.location || mall.name}`}</span>
              </span>
            </span>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-fleet-ember transition group-hover:translate-x-0.5" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[0.65rem] font-black text-slate-500">
            <StatusBadge tone={vendorIsOpen(store.operatingStatus) ? "green" : "red"}>{vendorStatusLabel(store.operatingStatus)}</StatusBadge>
            <span className="rounded-full bg-fleet-paper px-2 py-1">
              {vendor.location.state} · {productCount} product{productCount === 1 ? "" : "s"}
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
  vendorId,
  state
}: {
  initialMalls: ShoppingMall[];
  category?: MallCategory | null;
  vendorId?: string;
  state?: string | null;
}) {
  const malls = useLiveShoppingMalls(initialMalls);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [interstateConfirmed, setInterstateConfirmed] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<MarketplaceVehicleOption | null>(null);
  const [activeVendorFilter, setActiveVendorFilter] = useState("all");
  const [activeProductType, setActiveProductType] = useState("All Items");
  const [checkoutIsVisible, setCheckoutIsVisible] = useState(false);
  const checkoutRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const checkoutElement = checkoutRef.current;
    if (!checkoutElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setCheckoutIsVisible(entries.some((entry) => entry.isIntersecting));
      },
      { rootMargin: "0px 0px -30% 0px" }
    );

    observer.observe(checkoutElement);
    return () => observer.disconnect();
  }, []);

  const selectedVendor = useMemo(() => (vendorId ? findShoppingVendor(malls, vendorId, category, state) : null), [category, malls, state, vendorId]);
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
  const selectedVendorProductTypes = useMemo(() => selectedVendor ? shoppingProductTypes(selectedVendor.store) : [], [selectedVendor]);
  const displayedProductCount = displayedVendors.reduce(
    (count, vendor) => count + vendor.store.products.filter((product) => !selectedVendor || activeProductType === "All Items" || product.type === activeProductType).length,
    0
  );

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
  const { options: vehicleOptions, loading: vehicleLoading, error: vehicleError } = useMarketplaceVehicleOptions({ kind: "shopping", address, items: checkoutItems });
  const checkoutEstimate = selectedVehicle;
  const productsTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const platformFee = checkoutEstimate?.platformFee ?? PLATFORM_CHECKOUT_FEE_NGN;
  const deliveryFee = checkoutEstimate?.deliveryFee ?? 0;
  const finalTotal = checkoutEstimate?.total ?? productsTotal + platformFee;
  const activeCategory = selectedVendor?.store.category || category || visibleGroups[0]?.category || "Grocery";
  const meta = shoppingCategoryMeta[activeCategory];
  const heroImage = selectedVendor ? getShoppingStoreImage(selectedVendor.store, selectedVendor.mall) : categoryGroup?.image || meta.image;
  const pageTitle = missingVendor ? "Vendor not found" : selectedVendor ? selectedVendor.store.name : `${meta.label} vendors`;

  useEffect(() => {
    setInterstateConfirmed(false);
  }, [checkoutEstimate?.interstateDispatch, checkoutEstimate?.distanceKm]);

  useEffect(() => {
    setSelectedVehicle((current) => vehicleOptions.find((option) => option.id === current?.id && option.availability.status !== "unavailable") || null);
  }, [vehicleOptions]);

  useEffect(() => {
    if (selectedVendor) {
      setActiveVendorFilter("all");
      return;
    }
    if (activeVendorFilter !== "all" && !vendorFilters.some((filter) => filter.id === activeVendorFilter)) setActiveVendorFilter("all");
  }, [activeVendorFilter, selectedVendor, vendorFilters]);

  useEffect(() => {
    if (!selectedVendor || activeProductType === "All Items" || selectedVendorProductTypes.includes(activeProductType)) return;
    setActiveProductType("All Items");
  }, [activeProductType, selectedVendor, selectedVendorProductTypes]);

  function changeQuantity(mall: ShoppingMall, vendor: MallStore, location: MallStoreLocation, product: MallProduct, delta: number) {
    if (!vendorIsOpen(vendor.operatingStatus)) {
      setMessage(`${vendor.name} is currently closed and cannot accept orders.`);
      return;
    }
    if (typeof product.price !== "number") return;
    const price = shoppingProductPrice(product, location.state);
    if (typeof price !== "number") return;
    setCart((current) => {
      const key = cartKey(mall.id, vendor.id, location.state, product.id);
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
        pickupAddress: location.pickupAddress || mall.location || mall.name,
        pickupPlaceId: location.pickupPlaceId,
        pickupLatitude: location.pickupLatitude,
        pickupLongitude: location.pickupLongitude,
        pickupNote: location.pickupNote,
        vendorState: location.state,
        category: vendor.category,
        price,
        quantity,
        subtotal: price * quantity
      };
      return next;
    });
  }

  function askPrice(product: MallProduct, vendor: MallStore, mall: ShoppingMall, location: MallStoreLocation) {
    const text = encodeURIComponent(
      `Hello Fast Fleets 360, I want to ask the price of this shopping item.\n\nProduct: ${product.name}\nCategory: ${shoppingCategoryLabel(vendor.category)}\nVendor/store: ${vendor.name}\nPickup state: ${location.state}\nPickup area: ${location.pickupAddress || mall.location || mall.name}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  async function checkout() {
    setMessage(null);
    const closedVendor = vendors.find((vendor) => !vendorIsOpen(vendor.store.operatingStatus));
    if (closedVendor && cartItems.some((item) => item.vendorId === closedVendor.store.id)) {
      setMessage(`${closedVendor.store.name} is currently closed and cannot accept orders.`);
      return;
    }
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
    if (vehicleLoading || !selectedVehicle) {
      setMessage(vehicleError || "Choose an available Bicycle or Bike rider option before checkout.");
      return;
    }
    if (!selectedVehicle.allowed) {
      setMessage(selectedVehicle.policyMessage || "This order cannot be delivered to that address.");
      return;
    }
    if (selectedVehicle.interstateDispatch && !interstateConfirmed) {
      setMessage(selectedVehicle.policyMessage || "Confirm the interstate delivery timing before checkout.");
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
            platformFee: selectedVehicle.platformFee,
            deliveryFee: selectedVehicle.deliveryFee
          },
          amount: selectedVehicle.total,
          interstateConfirmed,
          vehicleOption: selectedVehicle.id
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
            vehicle_type: payload.vehicle || selectedVehicle.vehicle,
            vehicle_subtype: payload.vehicleSubtype || null,
            delivery_speed: selectedVehicle.deliverySpeed,
            price_ngn: selectedVehicle.total,
            distance_km: selectedVehicle.distanceKm,
            eta_minutes: selectedVehicle.etaMinutes,
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
        {!selectedVendor ? <div className="mb-5 overflow-hidden rounded-[22px] border border-fleet-line bg-white shadow-lift">
          <div className="grid gap-0 md:grid-cols-[240px_minmax(0,1fr)]">
            <div className="relative h-48 overflow-hidden bg-fleet-paper sm:h-56 md:h-full md:min-h-[205px]">
              <img src={heroImage} alt={pageTitle} loading="eager" decoding="async" className="h-full w-full object-cover" />
              <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[0.62rem] font-black uppercase tracking-[0.13em] text-fleet-ember shadow-[0_8px_20px_rgba(8,17,31,0.14)]">
                Shopping
              </span>
            </div>
            <div className="p-4 sm:p-5 md:flex md:flex-col md:justify-center">
              <h1 className="break-words text-2xl font-black leading-tight text-fleet-night sm:text-4xl">{pageTitle}</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                {`${vendors.length} verified vendors · ${displayedProductCount} products`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge tone="green">{vendors.length} vendors</StatusBadge>
                <StatusBadge tone="neutral">{cartItems.length} selected</StatusBadge>
              </div>
            </div>
          </div>
        </div> : null}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0">
            <div className="rounded-fleet border border-fleet-line bg-white p-4 shadow-[0_10px_24px_rgba(8,17,31,0.06)] sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">
                    {selectedVendor ? "Products" : `${meta.label} vendors`}
                  </span>
                  <h2 className="mt-1 break-words text-xl font-black leading-tight text-fleet-night sm:text-2xl">{selectedVendor ? "Choose your items" : "Choose a vendor"}</h2>
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
              {selectedVendor && selectedVendorProductTypes.length ? (
                <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
                  {["All Items", ...selectedVendorProductTypes].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setActiveProductType(type)}
                      className={cn(
                        "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-black transition",
                        activeProductType === type ? "bg-fleet-ember text-white shadow-[0_12px_26px_rgba(244,126,24,0.20)]" : "bg-fleet-paper text-fleet-night hover:bg-white hover:shadow-[0_10px_24px_rgba(8,17,31,0.08)]"
                      )}
                    >
                      {type}
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
                    productType={selectedVendor ? activeProductType : undefined}
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
                <div key={cartKey(item.mallId, item.vendorId, item.vendorState, item.productId)} className="rounded-fleet bg-fleet-paper p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <strong className="block truncate text-sm font-black text-fleet-night">{item.productName}</strong>
                      <span className="text-xs font-bold text-slate-500">{item.quantity} item · {item.vendorName} · {item.vendorState}</span>
                    </span>
                    <strong className="text-sm font-black text-fleet-night">{formatMoney(item.subtotal)}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-2 text-sm font-bold">
              <Summary label="Products" value={formatMoney(productsTotal)} />
              <Summary label="Delivery fee" value={vehicleLoading ? "Estimating..." : checkoutEstimate ? formatMoney(deliveryFee) : "Choose a rider"} />
              <Summary label="Platform fee" value={formatMoney(platformFee)} />
              {checkoutEstimate?.campus?.lecturerBenefit ? <div className="rounded-fleet bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-800">{checkoutEstimate.campus.message}</div> : null}
              {checkoutEstimate ? <Summary label="Route distance" value={`${checkoutEstimate.distanceKm.toFixed(1)} km`} /> : null}
              <Summary label="Final total" value={formatMoney(finalTotal)} strong />
            </div>

            <div className="mt-5 grid gap-3">
              <input className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email for receipt" type="email" />
            <input className="form-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" inputMode="tel" />
            <AddressAutocompleteInput label="Delivery address" value={address} onChange={setAddress} placeholder="Enter recipient street address" />
              <LightVehicleOptions options={vehicleOptions} selectedId={selectedVehicle?.id || ""} loading={vehicleLoading} error={vehicleError} onSelect={(option) => setSelectedVehicle(option as MarketplaceVehicleOption)} />
              {checkoutEstimate?.policyMessage ? <div className={`rounded-fleet p-3 text-xs font-bold leading-5 ${checkoutEstimate.allowed ? "bg-blue-50 text-blue-800" : "bg-rose-50 text-rose-800"}`}>{checkoutEstimate.policyMessage}</div> : null}
              {checkoutEstimate?.interstateDispatch ? (
                <label className="flex items-start gap-2 rounded-fleet border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">
                  <input type="checkbox" className="mt-0.5" checked={interstateConfirmed} onChange={(event) => setInterstateConfirmed(event.target.checked)} />
                  I understand this is an interstate dispatch and delivery timing starts after the seller prepares my order.
                </label>
              ) : null}
              <Button type="button" onClick={checkout} disabled={loading || vehicleLoading || cartItems.length === 0 || !selectedVehicle?.allowed || Boolean(selectedVehicle?.interstateDispatch && !interstateConfirmed)}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Checkout Shopping Order
              </Button>
            </div>
            {message || vehicleError ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{message || vehicleError}</div> : null}
          </Card>
          </div>
        </div>
        <MobileCartBar
          count={cartItems.length}
          total={finalTotal}
          label="Your Order"
          visible={!checkoutIsVisible}
          onOpen={() => {
            setCheckoutIsVisible(true);
            checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      </section>
    </>
  );
}

function ShoppingVendorMenuSection({
  vendor,
  cart,
  showVendorLink,
  productType,
  onQuantity,
  onAskPrice
}: {
  vendor: ShoppingCategoryVendor;
  cart: Record<string, CartItem>;
  showVendorLink: boolean;
  productType?: string;
  onQuantity: (mall: ShoppingMall, vendor: MallStore, location: MallStoreLocation, product: MallProduct, delta: number) => void;
  onAskPrice: (product: MallProduct, vendor: MallStore, mall: ShoppingMall, location: MallStoreLocation) => void;
}) {
  const { mall, store } = vendor;
  const vendorImage = getShoppingStoreImage(store, mall);
  const categoryLabel = shoppingCategoryLabel(store.category);
  const orderingOpen = vendorIsOpen(store.operatingStatus);
  const displayedProducts = store.products.filter((product) => !productType || productType === "All Items" || product.type === productType);

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
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{orderingOpen ? `${store.products.length} products available` : "Currently closed for orders"}</p>
            </div>
            <StatusBadge tone={orderingOpen ? "green" : "red"}>{vendorStatusLabel(store.operatingStatus)}</StatusBadge>
            {showVendorLink ? (
              <Link href={shoppingVendorCategoryPath(store, vendor.location)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-fleet border border-fleet-line bg-white px-3 text-xs font-black text-fleet-night transition hover:border-fleet-ember">
                Open vendor page
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
          <span className="mt-3 flex items-start gap-1.5 text-xs font-bold leading-5 text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fleet-ember" />
              <span className="line-clamp-2">{vendor.location.pickupAddress || `${vendor.location.state} · ${mall.location || mall.name}`}</span>
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 border-t border-fleet-line bg-fleet-paper/55 p-2.5 sm:gap-3 sm:p-3 md:grid-cols-3 xl:grid-cols-4">
        {displayedProducts.map((product) => {
          const key = cartKey(mall.id, store.id, vendor.location.state, product.id);
          const quantity = cart[key]?.quantity || 0;
          const resolvedPrice = shoppingProductPrice(product, vendor.location.state);
          const price = typeof resolvedPrice === "number" ? resolvedPrice : null;
          const canBuy = orderingOpen && product.available && price !== null;
          return (
            <article key={key} className="flex min-h-full flex-col overflow-hidden rounded-[16px] border border-fleet-line bg-white shadow-[0_8px_18px_rgba(8,17,31,0.05)] transition hover:border-fleet-ember">
              <div className="h-24 w-full bg-fleet-paper p-2 sm:h-28">
                <img src={product.image || vendorImage} alt={product.name} loading="lazy" decoding="async" className="h-full w-full object-contain" />
              </div>
              <div className="flex flex-1 flex-col p-2.5">
                <span className="w-fit rounded-full bg-fleet-paper px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-[0.1em] text-fleet-ember">{product.type || categoryLabel}</span>
                <h4 className="mt-1.5 line-clamp-2 min-h-[2.25rem] break-words text-sm font-black leading-tight text-fleet-night">{product.name}</h4>
                <p className="mt-1 line-clamp-1 text-[0.7rem] font-bold leading-4 text-slate-500">{store.name}</p>
                <strong className="mt-2 block text-base font-black text-fleet-ember">{price !== null ? formatMoney(price) : "Ask price"}</strong>
              {canBuy ? (
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <div className="inline-flex h-9 items-center rounded-[12px] bg-fleet-paper p-0.5">
                    <button type="button" onClick={() => onQuantity(mall, store, vendor.location, product, -1)} className="grid h-8 w-8 place-items-center rounded-[10px] text-fleet-night" aria-label={`Remove ${product.name}`}>
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-7 text-center text-xs font-black text-fleet-night">{quantity}</span>
                    <button type="button" onClick={() => onQuantity(mall, store, vendor.location, product, 1)} className="grid h-8 w-8 place-items-center rounded-[10px] bg-fleet-night text-white shadow-[0_8px_18px_rgba(8,17,31,0.16)]" aria-label={`Add ${product.name}`}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-xs font-black text-fleet-night">{formatMoney(quantity * Number(price || 0))}</span>
                </div>
              ) : orderingOpen ? (
                <Button type="button" size="sm" variant="dark" onClick={() => onAskPrice(product, store, mall, vendor.location)} className="mt-auto w-full justify-center">
                  <MessageCircle className="h-4 w-4" />
                  Ask Price
                </Button>
              ) : (
                <span className="mt-auto inline-flex min-h-9 items-center justify-center rounded-[12px] bg-slate-100 px-2 text-xs font-black text-slate-500">Vendor closed</span>
              )}
              </div>
            </article>
          );
        })}
        {!displayedProducts.length ? <div className="col-span-full rounded-fleet bg-white p-4 text-center text-sm font-bold text-slate-500">No products in this type yet.</div> : null}
      </div>
    </section>
  );
}

function MobileCartBar({ count, total, label, visible, onOpen }: { count: number; total: number; label: string; visible: boolean; onOpen: () => void }) {
  if (!count || !visible) return null;
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
    locations: [vendor.location.pickupAddress || vendor.location.state || vendor.mall.location || vendor.mall.name].filter(Boolean)
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

function cartKey(mallId: string, vendorId: string, state: string, productId: string) {
  return `${mallId}:${vendorId}:${state}:${productId}`;
}

function vendorKey(vendor: ShoppingCategoryVendor) {
  return `${vendor.mall.id}:${vendor.store.id}:${vendor.location.state}`;
}

function sortVendorsByState(vendors: ShoppingCategoryVendor[], customerState?: string | null) {
  const preferred = String(customerState || "").trim().toLowerCase();
  return [...vendors].sort((left, right) => {
    const leftPreferred = left.location.state.toLowerCase() === preferred ? 0 : 1;
    const rightPreferred = right.location.state.toLowerCase() === preferred ? 0 : 1;
    return leftPreferred - rightPreferred || left.location.state.localeCompare(right.location.state) || left.store.name.localeCompare(right.store.name);
  });
}
