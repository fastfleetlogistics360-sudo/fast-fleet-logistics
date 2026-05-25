"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, MessageCircle, Minus, Plus, ShoppingCart, Store } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { defaultShoppingMalls, mallMenuStorageKey, normalizeShoppingMalls } from "@/lib/mall-menu";
import type { MallCategory, MallProduct, MallStore, ShoppingMall } from "@/lib/mall-menu";

const MALL_DELIVERY_BASE_FEE_NGN = 1500;
const MALL_EXTRA_DISTANCE_FEE_NGN = 300;
const MALL_PLATFORM_FEE_NGN = 500;
const DEFAULT_DISTANCE_KM = 1;

type CartItem = {
  productId: string;
  productName: string;
  mallId: string;
  mallName: string;
  vendorId: string;
  vendorName: string;
  category: MallCategory;
  price: number;
  quantity: number;
  subtotal: number;
};

const categories: Array<"All" | MallCategory> = ["All", "Grocery", "Pharmacy", "Fashion"];

export function MallMarketplace() {
  const [malls, setMalls] = useState<ShoppingMall[]>(defaultShoppingMalls);
  const [selectedMallId, setSelectedMallId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<"All" | MallCategory>("All");
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("Lekki Phase 1, Lagos");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedMall = malls.find((mall) => mall.id === selectedMallId) || null;
  const stores = selectedMall?.stores || [];
  const filteredStores = activeCategory === "All" ? stores : stores.filter((store) => store.category === activeCategory);
  const selectedVendor = stores.find((store) => store.id === selectedVendorId) || null;
  const visibleProducts = selectedVendor ? selectedVendor.products : [];
  const cartItems = Object.values(cart);
  const productsTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const deliveryFee = useMemo(() => {
    const extraKm = Math.max(0, DEFAULT_DISTANCE_KM - 1);
    return MALL_DELIVERY_BASE_FEE_NGN + extraKm * MALL_EXTRA_DISTANCE_FEE_NGN;
  }, []);
  const finalTotal = productsTotal + deliveryFee + MALL_PLATFORM_FEE_NGN;

  useEffect(() => {
    function applyStoredMalls() {
      try {
        const stored = window.localStorage.getItem(mallMenuStorageKey);
        if (stored) setMalls(normalizeShoppingMalls(JSON.parse(stored)));
      } catch {
        // Keep bundled mall data if local fallback data is malformed.
      }
    }

    applyStoredMalls();
    fetch("/api/marketplace/malls")
      .then((response) => response.json())
      .then((payload) => {
        if (Array.isArray(payload.malls)) {
          const nextMalls = normalizeShoppingMalls(payload.malls);
          setMalls(nextMalls);
          window.localStorage.setItem(mallMenuStorageKey, JSON.stringify(nextMalls));
        }
      })
      .catch(() => applyStoredMalls());

    window.addEventListener("storage", applyStoredMalls);
    return () => window.removeEventListener("storage", applyStoredMalls);
  }, []);

  function selectMall(mallId: string) {
    setSelectedMallId(mallId);
    setSelectedVendorId(null);
    setActiveCategory("All");
    setMessage(null);
  }

  function changeQuantity(product: MallProduct, delta: number) {
    if (!selectedMall || !selectedVendor || typeof product.price !== "number") return;
    const price = product.price;
    setCart((current) => {
      const key = cartKey(selectedMall.id, selectedVendor.id, product.id);
      const quantity = Math.max(0, (current[key]?.quantity || 0) + delta);
      const next = { ...current };
      if (quantity === 0) {
        delete next[key];
        return next;
      }
      next[key] = {
        productId: product.id,
        productName: product.name,
        mallId: selectedMall.id,
        mallName: selectedMall.name,
        vendorId: selectedVendor.id,
        vendorName: selectedVendor.name,
        category: selectedVendor.category,
        price,
        quantity,
        subtotal: price * quantity
      };
      return next;
    });
  }

  function askPrice(product: MallProduct, vendor: MallStore, mall: ShoppingMall) {
    const text = encodeURIComponent(
      `Hello FastFleet, I want to ask the price of this item.\n\nProduct: ${product.name}\nMall: ${mall.name}\nVendor/store: ${vendor.name}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  async function checkout() {
    setMessage(null);
    if (!cartItems.length) {
      setMessage("Add at least one priced mall product before checkout.");
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
          kind: "shopping",
          email,
          phone,
          address,
          items: cartItems.map((item) => ({
            ...item,
            name: item.productName,
            store: `${item.mallName} · ${item.vendorName}`
          })),
          fees: {
            platformFee: MALL_PLATFORM_FEE_NGN,
            deliveryFee
          },
          amount: finalTotal
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
            pickup_address: cartItems.map((item) => `${item.mallName} · ${item.vendorName}`).join(", "),
            dropoff_address: address,
            status: "searching",
            vehicle_type: "bike",
            delivery_speed: "same_day",
            price_ngn: finalTotal,
            eta_minutes: 35,
            source: "shopping_mall_checkout",
            created_at: new Date().toISOString()
          },
          ...stored
        ])
      );
      window.location.assign(payload.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mall checkout failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section-wrap py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0">
          <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <StatusBadge tone="blue">FastFleet Mall</StatusBadge>
              <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-6xl">Shop malls by store, not generic shelves.</h1>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
                Pick a mall, choose a vendor inside it, then add that vendor's products to cart with vendor-specific prices.
              </p>
            </div>
            <Card className="bg-fleet-navy p-5 text-white">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-fleet bg-white text-fleet-navy">
                  <Store className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="text-xl font-black">Vendor onboarding</h2>
                  <p className="mt-1 text-sm font-semibold text-white/75">Stores inside malls can register for KYC review.</p>
                </div>
              </div>
              <LinkButton href="/business/register" className="mt-5 w-full bg-fleet-gold text-fleet-night hover:bg-fleet-gold">
                Register your store
              </LinkButton>
            </Card>
          </div>

          <div className="mt-8 grid gap-6">
            <MallChooser malls={malls} selectedMallId={selectedMallId} onSelect={selectMall} />

            {selectedMall ? (
              <div className="grid gap-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                  <div>
                    <button type="button" onClick={() => selectMall("")} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">
                      <ArrowLeft className="h-4 w-4" />
                      Change mall
                    </button>
                    <h2 className="mt-2 text-3xl font-black text-fleet-night">{selectedMall.name} stores</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">{selectedMall.location}</p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {categories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => {
                          setActiveCategory(category);
                          setSelectedVendorId(null);
                        }}
                        className={cn(
                          "min-h-10 shrink-0 rounded-fleet border px-4 text-sm font-black transition",
                          activeCategory === category ? "border-fleet-ember bg-fleet-ember text-white" : "border-fleet-line bg-white text-slate-600"
                        )}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>

                {!selectedVendor ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredStores.map((store) => (
                      <button
                        key={store.id}
                        type="button"
                        onClick={() => setSelectedVendorId(store.id)}
                        className="rounded-fleet border border-fleet-line bg-white p-4 text-left shadow-[0_12px_26px_rgba(8,17,31,0.08)] transition hover:-translate-y-1 hover:border-fleet-gold"
                      >
                        <span className="rounded-full bg-fleet-paper px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-fleet-ember">{store.category}</span>
                        <strong className="mt-4 block text-xl font-black text-fleet-night">{store.name}</strong>
                        <span className="mt-2 block text-sm font-bold text-slate-500">{store.products.length} products available</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <div className="flex flex-col justify-between gap-3 rounded-fleet border border-fleet-line bg-white p-4 sm:flex-row sm:items-center">
                      <div>
                        <button type="button" onClick={() => setSelectedVendorId(null)} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">
                          <ArrowLeft className="h-4 w-4" />
                          Back to stores
                        </button>
                        <h3 className="mt-2 text-2xl font-black text-fleet-night">{selectedVendor.name}</h3>
                        <p className="text-sm font-bold text-slate-500">{selectedVendor.category} vendor in {selectedMall.name}</p>
                      </div>
                      <StatusBadge tone="green">{visibleProducts.length} products</StatusBadge>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {visibleProducts.map((product) => {
                        const key = cartKey(selectedMall.id, selectedVendor.id, product.id);
                        const quantity = cart[key]?.quantity || 0;
                        const price = typeof product.price === "number" ? product.price : null;
                        const canBuy = product.available && price !== null;
                        return (
                          <Card key={key} className="overflow-hidden p-0">
                            <div className="relative aspect-[4/3] bg-fleet-paper">
                              <Image src={product.image} alt={product.name} fill sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                            </div>
                            <div className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <span className="min-w-0">
                                  <strong className="block text-lg font-black leading-tight text-fleet-night">{product.name}</strong>
                                  <span className="mt-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{selectedVendor.name}</span>
                                  <span className="mt-2 inline-flex rounded-full bg-fleet-paper px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-fleet-ember">{selectedVendor.category}</span>
                                </span>
                                <strong className="shrink-0 text-sm font-black text-fleet-night">{price !== null ? formatMoney(price) : "Ask price"}</strong>
                              </div>
                              {canBuy ? (
                                <div className="mt-4 grid gap-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="inline-flex items-center gap-1 rounded-fleet bg-fleet-paper p-1">
                                      <button type="button" onClick={() => changeQuantity(product, -1)} className="grid h-9 w-9 place-items-center rounded-fleet text-fleet-night" aria-label={`Remove ${product.name}`}>
                                        <Minus className="h-4 w-4" />
                                      </button>
                                      <span className="min-w-8 text-center text-sm font-black text-fleet-night">{quantity}</span>
                                      <button type="button" onClick={() => changeQuantity(product, 1)} className="grid h-9 w-9 place-items-center rounded-fleet bg-fleet-night text-white" aria-label={`Add ${product.name}`}>
                                        <Plus className="h-4 w-4" />
                                      </button>
                                    </div>
                                    <span className="text-sm font-black text-fleet-ember">{formatMoney(quantity * price)}</span>
                                  </div>
                                  <Button type="button" onClick={() => changeQuantity(product, 1)} className="w-full">
                                    <ShoppingCart className="h-4 w-4" />
                                    Add to Cart
                                  </Button>
                                </div>
                              ) : (
                                <Button type="button" variant="dark" onClick={() => askPrice(product, selectedVendor, selectedMall)} className="mt-4 w-full">
                                  <MessageCircle className="h-4 w-4" />
                                  Ask Price
                                </Button>
                              )}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <Card className="sticky top-24 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Mall checkout</span>
              <strong className="mt-1 block text-3xl font-black text-fleet-night">{formatMoney(finalTotal)}</strong>
            </div>
            <StatusBadge tone="green">{cartItems.length} items</StatusBadge>
          </div>

          <div className="mt-5 grid gap-3">
            {cartItems.length === 0 ? <div className="rounded-fleet bg-fleet-paper p-3 text-sm font-bold text-slate-500">No priced mall products selected yet.</div> : null}
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
            <Summary label="Delivery fee" value={formatMoney(deliveryFee)} />
            <Summary label="Platform fee" value={formatMoney(MALL_PLATFORM_FEE_NGN)} />
            <Summary label="Final total" value={formatMoney(finalTotal)} strong />
          </div>

          <div className="mt-5 grid gap-3">
            <input className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email for receipt" type="email" />
            <input className="form-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" inputMode="tel" />
            <textarea className="form-textarea min-h-20" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Delivery address" />
            <Button type="button" onClick={checkout} disabled={loading || cartItems.length === 0}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              Checkout Mall Order
            </Button>
          </div>
          {message ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{message}</div> : null}
        </Card>
      </div>
    </section>
  );
}

function MallChooser({ malls, selectedMallId, onSelect }: { malls: ShoppingMall[]; selectedMallId: string | null; onSelect: (mallId: string) => void }) {
  return (
    <div className="grid gap-4">
      <div>
        <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Choose mall</span>
        <h2 className="mt-2 text-3xl font-black text-fleet-night">Available malls</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {malls.map((mall) => (
          <button
            key={mall.id}
            type="button"
            onClick={() => onSelect(mall.id)}
            className={cn(
              "overflow-hidden rounded-fleet border bg-white text-left shadow-[0_12px_26px_rgba(8,17,31,0.08)] transition hover:-translate-y-1",
              selectedMallId === mall.id ? "border-fleet-ember" : "border-fleet-line"
            )}
          >
            <span className="relative block aspect-[16/10] bg-fleet-paper">
              <Image src={mall.image} alt={mall.name} fill sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
            </span>
            <span className="block p-4">
              <strong className="block text-xl font-black text-fleet-night">{mall.name}</strong>
              <span className="mt-1 block text-sm font-bold text-slate-500">{mall.location}</span>
              <span className="mt-3 inline-flex rounded-full bg-fleet-paper px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-fleet-ember">{mall.stores.length} stores</span>
            </span>
          </button>
        ))}
      </div>
    </div>
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
