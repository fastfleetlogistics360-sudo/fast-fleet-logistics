"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Bell, Home, MapPin, PackageCheck, Search, Settings, UserRound, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, initials } from "@/lib/format";
import { AccountDeletionButton } from "@/components/dashboard/account-deletion";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

type CustomerTab = "home" | "orders" | "track" | "account";
type OrderStatus = "pending" | "assigned" | "searching" | "accepted" | "rider_arrived" | "picked_up" | "in_transit" | "delivered" | "cancelled";

type ProfileRow = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  lga?: string | null;
  default_zone?: string | null;
};

type WalletRow = {
  balance_ngn?: number | null;
  locked_balance_ngn?: number | null;
  balance?: number | null;
};

type RiderInfo = {
  full_name?: string | null;
  phone?: string | null;
};

type OrderRow = {
  id: string;
  delivery_code: string;
  pickup_address: string;
  dropoff_address: string;
  status: OrderStatus | string;
  price_ngn: number;
  created_at: string;
  delivered_at?: string | null;
  proof_url?: string | null;
  rider_profiles?: {
    plate_number?: string | null;
    vehicle_type?: string | null;
    vehicle_color?: string | null;
    users?: RiderInfo | null;
  } | null;
};

type PromotionRow = {
  id: string;
  title: string;
  image_url?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  active?: boolean | null;
};

type SavedAddress = {
  id: string;
  label: string;
  address: string;
};

const tabs: Array<{ id: CustomerTab; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "orders", label: "Orders", icon: PackageCheck },
  { id: "track", label: "Track", icon: MapPin },
  { id: "account", label: "Account", icon: UserRound }
];

const fallbackProfile: ProfileRow = {
  full_name: "FastFleet Customer",
  email: "customer@fastfleet.ng",
  phone: "+2348012345678",
  lga: "Lagos"
};

function statusTone(status: string): "green" | "amber" | "red" | "blue" | "neutral" {
  if (status === "delivered") return "green";
  if (status === "cancelled") return "red";
  if (["in_transit", "picked_up", "rider_arrived"].includes(status)) return "blue";
  if (["assigned", "accepted", "searching", "pending"].includes(status)) return "amber";
  return "neutral";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good morning", symbol: "🌅" };
  if (hour < 17) return { text: "Good afternoon", symbol: "☀️" };
  return { text: "Good evening", symbol: "🌙" };
}

export function CustomerDashboard() {
  const [activeTab, setActiveTab] = useState<CustomerTab>("home");
  const [profile, setProfile] = useState<ProfileRow>(fallbackProfile);
  const [wallet, setWallet] = useState<WalletRow>({ balance_ngn: 0, locked_balance_ngn: 0 });
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderFilter, setOrderFilter] = useState<"all" | "active" | "delivered" | "cancelled">("all");
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [searchCode, setSearchCode] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [addressDraft, setAddressDraft] = useState({ label: "", address: "" });
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState({ sms: true, email: true, push: true });

  const firstName = (profile.full_name || profile.email || "there").trim().split(/\s+/)[0] || "there";
  const activeOrder = orders.find((order) => !["delivered", "cancelled"].includes(order.status)) || null;
  const trackedOrder = orders.find((order) => order.delivery_code.toLowerCase() === searchCode.trim().toLowerCase()) || activeOrder;
  const { text: greetingText, symbol } = greeting();
  const balance = Number(wallet.balance_ngn ?? wallet.balance ?? 0);
  const filteredOrders = useMemo(() => {
    if (orderFilter === "all") return orders;
    if (orderFilter === "active") return orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
    return orders.filter((order) => order.status === orderFilter);
  }, [orderFilter, orders]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) return;

        const [profileResult, walletResult, orderResult, promotionResult, addressResult] = await Promise.all([
          supabase.from("profiles").select("id, full_name, email, phone, avatar_url, lga").eq("user_id", user.id).maybeSingle(),
          supabase.from("wallets").select("balance_ngn, locked_balance_ngn, balance").eq("user_id", user.id).maybeSingle(),
          supabase
            .from("deliveries")
            .select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, created_at, delivered_at, proof_url, rider_profiles(plate_number, vehicle_type, vehicle_color, users(full_name, phone))")
            .eq("customer_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase.from("promotions").select("id, title, image_url, cta_label, cta_url, active").eq("active", true).order("created_at", { ascending: false }).limit(8),
          supabase.from("saved_addresses").select("id, label, address").eq("user_id", user.id).order("created_at", { ascending: false })
        ]);

        if (!mounted) return;
        setProfile((profileResult.data as ProfileRow | null) || { ...fallbackProfile, email: user.email, phone: user.phone });
        setWallet((walletResult.data as WalletRow | null) || { balance_ngn: 0, locked_balance_ngn: 0 });
        if (orderResult.error) throw orderResult.error;
        if (promotionResult.error) throw promotionResult.error;
        setOrders((orderResult.data || []) as OrderRow[]);
        setPromotions((promotionResult.data || []) as PromotionRow[]);
        setAddresses((addressResult.data || []) as SavedAddress[]);
      } catch (error) {
        if (!mounted) return;
        setOrders([]);
        setPromotions([]);
        setLoadError(error instanceof Error ? error.message : "Could not load your dashboard data.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  async function saveProfile() {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to update your profile.");
      await supabase.from("profiles").update({ full_name: profile.full_name, phone: profile.phone, lga: profile.lga, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      setProfileMessage("Profile updated.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function addAddress() {
    if (!addressDraft.label.trim() || !addressDraft.address.trim()) return;
    const optimistic: SavedAddress = { id: `local-${Date.now()}`, label: addressDraft.label, address: addressDraft.address };
    setAddresses((current) => [optimistic, ...current]);
    setAddressDraft({ label: "", address: "" });
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("saved_addresses").insert({ user_id: user.id, label: optimistic.label, address: optimistic.address });
    } catch {
      // Optimistic address remains available locally for the session.
    }
  }

  async function deleteAddress(id: string) {
    setAddresses((current) => current.filter((address) => address.id !== id));
    try {
      const supabase = createClient();
      await supabase.from("saved_addresses").delete().eq("id", id);
    } catch {
      // Optimistic delete keeps the UI responsive.
    }
  }

  async function signOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      window.location.assign("/auth");
    }
  }

  return (
    <section className="min-h-screen bg-fleet-paper pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl gap-0 lg:grid-cols-[260px_1fr]">
        <DesktopNav activeTab={activeTab} onChange={setActiveTab} />
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:py-8">
          <DashboardHeader title={`${greetingText}, ${firstName}`} subtitle={`${symbol} Your FastFleet mobile workspace is ready.`} />
          {activeTab === "home" ? (
            <HomeTab loading={loading} profile={profile} balance={balance} activeOrder={activeOrder} orders={orders} promotions={promotions} loadError={loadError} onSelectOrder={setSelectedOrder} />
          ) : null}
          {activeTab === "orders" ? (
            <OrdersTab loading={loading} orders={filteredOrders} filter={orderFilter} onFilter={setOrderFilter} onSelectOrder={setSelectedOrder} />
          ) : null}
          {activeTab === "track" ? <TrackTab order={trackedOrder} searchCode={searchCode} onSearchCode={setSearchCode} /> : null}
          {activeTab === "account" ? (
            <AccountTab
              profile={profile}
              onProfile={setProfile}
              saving={profileSaving}
              message={profileMessage}
              onSaveProfile={saveProfile}
              addresses={addresses}
              addressDraft={addressDraft}
              onAddressDraft={setAddressDraft}
              onAddAddress={addAddress}
              onDeleteAddress={deleteAddress}
              prefs={prefs}
              onPrefs={setPrefs}
              onSignOut={signOut}
            />
          ) : null}
        </main>
      </div>
      <MobileTabs activeTab={activeTab} onChange={setActiveTab} />
      {selectedOrder ? <OrderSheet order={selectedOrder} onClose={() => setSelectedOrder(null)} /> : null}
    </section>
  );
}

function DashboardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-5 flex items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black text-fleet-night sm:text-4xl">{title}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">{subtitle}</p>
      </div>
      <NotificationBell />
    </header>
  );
}

function DesktopNav({ activeTab, onChange }: { activeTab: CustomerTab; onChange: (tab: CustomerTab) => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen border-r border-fleet-line bg-white p-4 lg:block">
      <div className="rounded-fleet bg-fleet-navy p-4 text-white">
        <span className="text-xl font-black">FastFleet</span>
        <p className="mt-1 text-xs font-semibold text-white/70">Customer app</p>
      </div>
      <nav className="mt-5 grid gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn("flex items-center gap-3 rounded-fleet px-3 py-3 text-sm font-black", activeTab === tab.id ? "bg-fleet-navy text-white" : "text-slate-600 hover:bg-fleet-paper")}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function MobileTabs({ activeTab, onChange }: { activeTab: CustomerTab; onChange: (tab: CustomerTab) => void }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 rounded-fleet border border-fleet-line bg-white/95 p-1 shadow-glow backdrop-blur lg:hidden">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn("grid min-h-14 place-items-center rounded-fleet text-[0.7rem] font-black", activeTab === tab.id ? "bg-fleet-navy text-white" : "text-slate-500")}>
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function HomeTab({
  loading,
  profile,
  balance,
  activeOrder,
  orders,
  promotions,
  loadError,
  onSelectOrder
}: {
  loading: boolean;
  profile: ProfileRow;
  balance: number;
  activeOrder: OrderRow | null;
  orders: OrderRow[];
  promotions: PromotionRow[];
  loadError: string | null;
  onSelectOrder: (order: OrderRow) => void;
}) {
  if (loading) return <DashboardSkeleton />;
  return (
    <div className="grid gap-5">
      {loadError ? <div className="rounded-fleet bg-red-50 p-3 text-sm font-bold text-red-700">{loadError}</div> : null}
      <Card id="wallet" className="overflow-hidden bg-fleet-navy p-5 text-white">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-white/60">Wallet balance</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-4xl font-black">{formatMoney(balance)}</h2>
            <p className="mt-2 text-sm font-semibold text-white/70">{profile.lga || profile.default_zone || "Lagos"} delivery wallet</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <LinkButton href="/wallet/callback" className="bg-white text-fleet-navy hover:bg-white">Top up</LinkButton>
            <LinkButton href="/support?topic=wallet-withdrawal" variant="secondary">Withdraw</LinkButton>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-2">
        {[
          ["Book", "/book"],
          ["Track", "/track"],
          ["Food", "/restaurants"],
          ["Mall", "/shopping-mall"]
        ].map(([label, href]) => (
          <LinkButton key={label} href={href} variant="secondary" className="min-h-16 px-2 text-xs">
            {label}
          </LinkButton>
        ))}
      </div>

      {activeOrder ? <ActiveDeliveryCard order={activeOrder} onSelect={() => onSelectOrder(activeOrder)} /> : <DashboardEmptyState title="No active delivery" body="Book your first delivery and live rider updates will appear here." ctaLabel="Book delivery" ctaHref="/book" />}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black text-fleet-night">Promotions</h2>
          <StatusBadge tone="blue">{promotions.length} live</StatusBadge>
        </div>
        {promotions.length ? (
          <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto">
            {promotions.map((promotion) => (
              <Card key={promotion.id} className="min-w-[82%] snap-start p-4 sm:min-w-[360px]">
                <div className="h-28 rounded-fleet bg-[linear-gradient(135deg,rgba(15,52,96,0.95),rgba(21,163,107,0.85))]" />
                <h3 className="mt-4 text-lg font-black text-fleet-night">{promotion.title}</h3>
                <LinkButton href={promotion.cta_url || "/book"} size="sm" className="mt-4">{promotion.cta_label || "Open"}</LinkButton>
              </Card>
            ))}
          </div>
        ) : (
          <DashboardEmptyState title="No promotions yet" body="Fresh offers will appear here when FastFleet publishes them." ctaLabel="Book delivery" ctaHref="/book" icon={<Bell className="h-7 w-7" />} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-black text-fleet-night">Recent orders</h2>
        {orders.length ? (
          <div className="grid gap-3">
            {orders.slice(0, 5).map((order) => <OrderRowCard key={order.id} order={order} onSelect={() => onSelectOrder(order)} compact />)}
          </div>
        ) : (
          <DashboardEmptyState title="No orders yet" body="Your completed and active deliveries will appear here after booking." ctaLabel="Book delivery" ctaHref="/book" />
        )}
      </section>
    </div>
  );
}

function ActiveDeliveryCard({ order, onSelect }: { order: OrderRow; onSelect: () => void }) {
  const riderName = order.rider_profiles?.users?.full_name || "Assigned rider";
  return (
    <Card className="animate-pulseSoft border-fleet-navy/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-fleet-navy text-sm font-black text-white">{initials(riderName)}</span>
          <div>
            <h2 className="text-lg font-black text-fleet-night">{riderName}</h2>
            <p className="text-xs font-bold text-slate-500">{order.rider_profiles?.plate_number || "Plate pending"} · {order.rider_profiles?.vehicle_type || "bike"}</p>
          </div>
        </div>
        <StatusBadge tone={statusTone(order.status)}>{order.status.replaceAll("_", " ")}</StatusBadge>
      </div>
      <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">{order.pickup_address} to {order.dropoff_address}</p>
      <Button type="button" className="mt-4 w-full bg-fleet-navy hover:bg-fleet-night" onClick={onSelect}>Track</Button>
    </Card>
  );
}

function OrdersTab({ loading, orders, filter, onFilter, onSelectOrder }: { loading: boolean; orders: OrderRow[]; filter: "all" | "active" | "delivered" | "cancelled"; onFilter: (filter: "all" | "active" | "delivered" | "cancelled") => void; onSelectOrder: (order: OrderRow) => void }) {
  if (loading) return <DashboardSkeleton />;
  return (
    <div className="grid gap-4">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {(["all", "active", "delivered", "cancelled"] as const).map((item) => (
          <button key={item} type="button" onClick={() => onFilter(item)} className={cn("rounded-full px-4 py-2 text-sm font-black capitalize", filter === item ? "bg-fleet-navy text-white" : "bg-white text-slate-600")}>{item}</button>
        ))}
      </div>
      {orders.length ? (
        <div className="grid gap-3">{orders.map((order) => <OrderRowCard key={order.id} order={order} onSelect={() => onSelectOrder(order)} />)}</div>
      ) : (
        <DashboardEmptyState title="No orders found" body="Try another filter or book a new delivery." ctaLabel="Book delivery" ctaHref="/book" />
      )}
    </div>
  );
}

function OrderRowCard({ order, compact, onSelect }: { order: OrderRow; compact?: boolean; onSelect: () => void }) {
  return (
    <article className="rounded-fleet border border-fleet-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-500">{formatDateTime(order.created_at)}</p>
          <h3 className="mt-1 text-sm font-black text-fleet-night">{order.delivery_code}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{order.pickup_address} to {order.dropoff_address}</p>
        </div>
        <StatusBadge tone={statusTone(order.status)}>{order.status.replaceAll("_", " ")}</StatusBadge>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm font-black text-fleet-night">{formatMoney(order.price_ngn)}</strong>
        <div className="flex gap-2">
          {!compact ? <Button type="button" size="sm" variant="secondary" onClick={onSelect}>View details</Button> : null}
          <LinkButton href={`/book?reorder=${order.delivery_code}`} size="sm">Re-order</LinkButton>
        </div>
      </div>
    </article>
  );
}

function TrackTab({ order, searchCode, onSearchCode }: { order: OrderRow | null; searchCode: string; onSearchCode: (value: string) => void }) {
  const steps = ["Booked", "Rider assigned", "Picked up", "In transit", "Delivered"];
  const currentStep = order ? Math.max(0, ["pending", "assigned", "picked_up", "in_transit", "delivered"].findIndex((status) => status === order.status)) : 0;
  return (
    <div className="grid gap-5">
      <label className="form-field">
        <span className="form-label">Enter order ID</span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="form-input pl-10" value={searchCode} onChange={(event) => onSearchCode(event.target.value)} placeholder="FF-240911" />
        </div>
      </label>
      {order ? (
        <>
          <Card className="p-4">
            <h2 className="text-xl font-black text-fleet-night">{order.delivery_code}</h2>
            <div className="mt-5 grid gap-4">
              {steps.map((step, index) => (
                <div key={step} className="flex items-center gap-3">
                  <span className={cn("h-5 w-5 rounded-full border-4", index <= currentStep ? "border-fleet-navy bg-fleet-navy" : "border-slate-200 bg-white")} />
                  <span className="text-sm font-black text-fleet-night">{step}</span>
                </div>
              ))}
            </div>
          </Card>
          <div className="relative min-h-72 overflow-hidden rounded-fleet border border-fleet-line bg-white p-5">
            <div className="absolute inset-0 map-grid opacity-80" />
            <div className="relative flex h-56 items-center justify-between">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-fleet-navy font-black text-white">P</span>
              <span className="h-1 flex-1 border-t-4 border-dashed border-fleet-gold" />
              <span className="grid h-12 w-12 place-items-center rounded-full bg-fleet-leaf font-black text-white">D</span>
            </div>
          </div>
          <Card className="p-4">
            <h3 className="text-lg font-black text-fleet-night">Rider info</h3>
            <p className="mt-2 text-sm font-semibold text-slate-600">{order.rider_profiles?.users?.full_name || "Rider pending"} · Rating 4.9 · {order.rider_profiles?.vehicle_type || "bike"}</p>
            <LinkButton href={`tel:${order.rider_profiles?.users?.phone || ""}`} className="mt-4 w-full">Call rider</LinkButton>
          </Card>
        </>
      ) : (
        <DashboardEmptyState title="No active order to track" body="Enter an order ID or book a delivery to see live movement." ctaLabel="Book delivery" ctaHref="/book" />
      )}
    </div>
  );
}

function AccountTab({
  profile,
  onProfile,
  saving,
  message,
  onSaveProfile,
  addresses,
  addressDraft,
  onAddressDraft,
  onAddAddress,
  onDeleteAddress,
  prefs,
  onPrefs,
  onSignOut
}: {
  profile: ProfileRow;
  onProfile: (profile: ProfileRow) => void;
  saving: boolean;
  message: string | null;
  onSaveProfile: () => void;
  addresses: SavedAddress[];
  addressDraft: { label: string; address: string };
  onAddressDraft: (value: { label: string; address: string }) => void;
  onAddAddress: () => void;
  onDeleteAddress: (id: string) => void;
  prefs: { sms: boolean; email: boolean; push: boolean };
  onPrefs: (value: { sms: boolean; email: boolean; push: boolean }) => void;
  onSignOut: () => void;
}) {
  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-fleet-navy text-lg font-black text-white">{initials(profile.full_name || "FastFleet Customer")}</span>
          <div>
            <h2 className="text-xl font-black text-fleet-night">{profile.full_name || "FastFleet Customer"}</h2>
            <p className="text-sm font-semibold text-slate-500">{profile.email || "No email"} · {profile.phone || "No phone"}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={profile.full_name || ""} onChange={(value) => onProfile({ ...profile, full_name: value })} />
          <Field label="Phone" value={profile.phone || ""} onChange={(value) => onProfile({ ...profile, phone: value })} />
          <Field label="Email" value={profile.email || ""} onChange={(value) => onProfile({ ...profile, email: value })} readOnly />
          <Field label="LGA" value={profile.lga || profile.default_zone || ""} onChange={(value) => onProfile({ ...profile, lga: value })} />
        </div>
        {message ? <div className="mt-3 rounded-fleet bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</div> : null}
        <Button type="button" disabled={saving} className="mt-5 w-full bg-fleet-navy hover:bg-fleet-night" onClick={onSaveProfile}>Save profile</Button>
      </Card>
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Saved addresses</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[0.7fr_1fr_auto]">
          <input className="form-input" value={addressDraft.label} onChange={(event) => onAddressDraft({ ...addressDraft, label: event.target.value })} placeholder="Home" />
          <input className="form-input" value={addressDraft.address} onChange={(event) => onAddressDraft({ ...addressDraft, address: event.target.value })} placeholder="14 Acme Street, Ikeja" />
          <Button type="button" disabled={!addressDraft.label || !addressDraft.address} onClick={onAddAddress}>Add</Button>
        </div>
        <div className="mt-4 grid gap-2">
          {addresses.length ? addresses.map((address) => (
            <div key={address.id} className="flex items-center justify-between gap-3 rounded-fleet bg-fleet-paper p-3">
              <span><strong className="block text-sm font-black text-fleet-night">{address.label}</strong><span className="text-xs font-semibold text-slate-500">{address.address}</span></span>
              <Button type="button" size="sm" variant="secondary" onClick={() => onDeleteAddress(address.id)}>Delete</Button>
            </div>
          )) : <DashboardEmptyState title="No saved addresses" body="Add home, office, or favourite pickup points." ctaLabel="Book delivery" ctaHref="/book" />}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Notification preferences</h2>
        <div className="mt-4 grid gap-3">
          {(["sms", "email", "push"] as const).map((key) => (
            <label key={key} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3 text-sm font-black capitalize text-fleet-night">
              {key}
              <input type="checkbox" className="h-5 w-5 accent-fleet-navy" checked={prefs[key]} onChange={(event) => onPrefs({ ...prefs, [key]: event.target.checked })} />
            </label>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <AccountDeletionButton />
          <Button type="button" variant="secondary" onClick={onSignOut}>Sign out</Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, readOnly }: { label: string; value: string; onChange: (value: string) => void; readOnly?: boolean }) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} />
    </label>
  );
}

function OrderSheet({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-end bg-fleet-night/35 p-3 sm:place-items-center">
      <Card className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-fleet-night">{order.delivery_code}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{order.pickup_address} to {order.dropoff_address}</p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <div className="mt-5 grid gap-3">
          {["Booked", "Rider assigned", "Picked up", "Delivered"].map((item, index) => (
            <div key={item} className="flex items-center gap-3 rounded-fleet bg-fleet-paper p-3">
              <span className={cn("h-4 w-4 rounded-full", index === 0 || order.status === "delivered" || (index < 3 && !["pending", "assigned"].includes(order.status)) ? "bg-fleet-navy" : "bg-slate-200")} />
              <span className="text-sm font-black text-fleet-night">{item}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-fleet bg-fleet-paper p-4 text-sm font-bold text-slate-600">
          Rider: {order.rider_profiles?.users?.full_name || "Pending"} · Plate: {order.rider_profiles?.plate_number || "Pending"}
        </div>
        {order.proof_url ? (
          <Image src={order.proof_url} alt="Proof of delivery" width={720} height={360} unoptimized className="mt-4 max-h-64 w-full rounded-fleet object-cover" />
        ) : null}
        <Button type="button" className="mt-5 w-full bg-fleet-navy hover:bg-fleet-night">Download receipt</Button>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-40" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-56" />
    </div>
  );
}
