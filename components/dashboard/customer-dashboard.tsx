"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bell, Clock3, Home, LayoutDashboard, LockKeyhole, MapPin, MessageCircle, PackageCheck, Radar, Search, ShieldCheck, Sparkles, UserRound, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, initials } from "@/lib/format";
import { riderAccountTypeLabel, type RiderAccountType } from "@/lib/rider-account-type";
import { uploadProfilePhoto } from "@/lib/storage";
import { AccountDeletionButton } from "@/components/dashboard/account-deletion";
import { ActiveOrderMessengerSheet } from "@/components/dashboard/active-order-messenger-sheet";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { RoutePreview } from "@/components/maps/route-preview";
import { useLiveDeliveryTracking } from "@/components/realtime/use-live-delivery-tracking";
import { ReviewPrompt } from "@/components/reviews/review-prompt";
import { PackagePickupProof } from "@/components/tracking/package-pickup-proof";
import { TransactionHistory } from "@/components/wallet/transaction-history";
import { WalletDashboardCard } from "@/components/wallet/wallet-dashboard-card";
import { BackButton } from "@/components/ui/back-button";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { DEFAULT_LIVE_STATES, NIGERIAN_STATES, launchStatusLabel, normalizeLaunchStatus, normalizeState, rolloutWaveForState } from "@/lib/launch-states";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { accountMessengerHref, accountTrackingHref, publicTrackingHref } from "@/lib/tracking-links";
import type { LaunchStateStatus } from "@/lib/launch-states";
import { type PickupProof, metadataRecord } from "@/lib/pickup-proof";

type CustomerTab = "home" | "orders" | "track" | "account";
type OrderStatus = "pending" | "assigned" | "searching" | "accepted" | "rider_arrived" | "picked_up" | "in_transit" | "awaiting_delivery_confirmation" | "delivered" | "cancelled";

type ProfileRow = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  lga?: string | null;
  default_zone?: string | null;
  kyc_status?: string | null;
};

type WalletRow = {
  balance_ngn?: number | null;
  locked_balance_ngn?: number | null;
  balance?: number | null;
};

type RiderInfo = {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

type RiderTrackingDetails = {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  vehicle_type?: string | null;
  plate_number?: string | null;
  vehicle_color?: string | null;
  rider_account_type?: RiderAccountType | null;
};

type OrderRow = {
  id: string;
  rider_id?: string | null;
  delivery_id?: string | null;
  delivery_code: string;
  pickup_address: string;
  dropoff_address: string;
  status: OrderStatus | string;
  price_ngn: number;
  source?: string | null;
  marketplace_kind?: string | null;
  items?: Array<{ name?: string; productName?: string; quantity?: number; store?: string; vendorName?: string }> | null;
  created_at: string;
  delivered_at?: string | null;
  proof_url?: string | null;
  metadata?: Record<string, unknown> | null;
  rider_profiles?: {
    plate_number?: string | null;
    vehicle_type?: string | null;
    vehicle_color?: string | null;
    rider_account_type?: RiderAccountType | null;
    users?: RiderInfo | null;
  } | null;
};

type LocalDelivery = Partial<OrderRow> & {
  user_id?: string | null;
  customer_id?: string | null;
  pickup?: string;
  dropoff?: string;
  vehicle?: string;
  speed?: string;
  estimate?: { total?: number; etaMinutes?: number };
  source?: string;
};

const businessOrderStatuses = new Set(["received", "preparing", "packing", "ready_for_pickup", "rider_assigned", "picked_up", "in_transit", "awaiting_delivery_confirmation", "delivered"]);

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

type CustomerDashboardPayload = {
  user?: {
    id?: string | null;
    email?: string | null;
    phone?: string | null;
    metadata?: Record<string, unknown>;
  };
  profile?: ProfileRow | null;
  appUser?: { default_zone?: string | null } | null;
  wallet?: WalletRow | null;
  orders?: OrderRow[];
  promotions?: PromotionRow[];
  addresses?: SavedAddress[];
  error?: string;
};

const tabs: Array<{ id: CustomerTab; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "orders", label: "Orders", icon: PackageCheck },
  { id: "track", label: "Track", icon: MapPin },
  { id: "account", label: "Account", icon: UserRound }
];

const fallbackProfile: ProfileRow = {
  full_name: "Fast Fleets 360 Customer",
  email: "customer@fastfleet.ng",
  phone: "+2348012345678",
  lga: "Lagos"
};

const operationalStatuses = new Set<LaunchStateStatus>(["active", "live"]);
const riderVisibleStatuses = new Set(["accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation"]);
const customerPanelClass = "rounded-[24px] border-white/80 bg-white/[0.92] shadow-[0_22px_55px_rgba(8,17,31,0.10)] ring-1 ring-fleet-line/35 backdrop-blur-2xl";
const customerSoftPanelClass = "rounded-[22px] border border-white/80 bg-white/[0.86] shadow-[0_16px_42px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/30 backdrop-blur-2xl";

function statusTone(status: string): "green" | "amber" | "red" | "blue" | "neutral" {
  if (status === "delivered") return "green";
  if (status === "cancelled") return "red";
  if (["in_transit", "picked_up", "rider_arrived"].includes(status)) return "blue";
  if (["assigned", "accepted", "searching", "pending"].includes(status)) return "amber";
  return "neutral";
}

function isBusinessMarketplaceOrder(order: OrderRow) {
  return order.source === "business_marketplace_order" || Boolean(order.marketplace_kind);
}

function hasLiveDelivery(order: OrderRow) {
  if (isBusinessMarketplaceOrder(order)) return false;
  return Boolean(order.delivery_id || ["rider_assigned", "picked_up", "in_transit", "awaiting_delivery_confirmation", "delivered"].includes(String(order.status)));
}

function customerOrderLabel(status: string) {
  const labels: Record<string, string> = {
    received: "Order Received",
    preparing: "Preparing Order",
    packing: "Packing Order",
    ready_for_pickup: "Ready for Pickup",
    rider_assigned: "Rider Assigned",
    picked_up: "Order Picked by Dispatch",
    in_transit: "On the Way",
    delivered: "Delivered"
  };
  return labels[status] || status.replaceAll("_", " ");
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good morning", symbol: "🌅" };
  if (hour < 17) return { text: "Good afternoon", symbol: "☀️" };
  return { text: "Good evening", symbol: "🌙" };
}

function stringMetadata(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

async function enrichOrdersWithRiderDetails(orders: OrderRow[]) {
  const activeAssignedOrders = orders.filter((order) => order.rider_id && riderVisibleStatuses.has(String(order.status)) && !order.rider_profiles?.users?.full_name);
  if (!activeAssignedOrders.length) return orders;

  const details = await Promise.allSettled(
    activeAssignedOrders.map(async (order) => {
      const response = await fetch(`/api/tracking?code=${encodeURIComponent(order.delivery_code)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as {
        delivery?: {
          rider?: RiderTrackingDetails | null;
        };
      };
      if (!response.ok || !payload.delivery?.rider) return null;
      return { id: order.id, rider: payload.delivery.rider };
    })
  );

  const riderByOrderId = new Map<string, RiderTrackingDetails>();
  details.forEach((result) => {
    if (result.status === "fulfilled" && result.value) riderByOrderId.set(result.value.id, result.value.rider);
  });

  if (!riderByOrderId.size) return orders;
  return orders.map((order) => {
    const rider = riderByOrderId.get(order.id);
    if (!rider) return order;
    return {
      ...order,
      rider_profiles: {
        plate_number: rider.plate_number || null,
        vehicle_type: rider.vehicle_type || null,
        vehicle_color: rider.vehicle_color || null,
        rider_account_type: rider.rider_account_type || null,
        users: {
          full_name: rider.full_name || null,
          phone: rider.phone || null,
          email: rider.email || null,
          avatar_url: rider.avatar_url || null
        }
      }
    };
  });
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
  const [searchCode, setSearchCode] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [addressDraft, setAddressDraft] = useState({ label: "", address: "" });
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState({ sms: true, email: true, push: true });
  const [launchStatus, setLaunchStatus] = useState<LaunchStateStatus>("active");
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null);

  const firstName = profile.full_name?.trim().split(/\s+/)[0] || "there";
  const activeOrder = orders.find((order) => !["delivered", "cancelled"].includes(order.status)) || null;
  const trackedOrder = orders.find((order) => order.delivery_code.toLowerCase() === searchCode.trim().toLowerCase()) || activeOrder;
  const reviewableOrder = useMemo(() => orders.find((order) => String(order.status) === "delivered" && !String(order.id).startsWith("local-")), [orders]);
  const reviewSubject = useMemo(() => {
    if (!reviewableOrder) return null;
    const marketplaceOrder = isBusinessMarketplaceOrder(reviewableOrder);
    const deliveryId = reviewableOrder.delivery_id || (!marketplaceOrder ? reviewableOrder.id : null);
    if (!marketplaceOrder && !deliveryId) return null;
    return {
      reviewerRole: "customer" as const,
      subjectType: marketplaceOrder ? ("business_order" as const) : ("customer_delivery" as const),
      orderId: marketplaceOrder ? reviewableOrder.id : null,
      deliveryId,
      targetRiderProfileId: reviewableOrder.rider_id || null,
      title: marketplaceOrder ? "How was this marketplace order?" : "How was this delivery?",
      body: "Your review helps us improve rider, store, and support quality.",
      metadata: {
        delivery_code: reviewableOrder.delivery_code,
        source: reviewableOrder.source || null,
        marketplace_kind: reviewableOrder.marketplace_kind || null
      }
    };
  }, [reviewableOrder]);
  const { text: greetingText } = greeting();
  const balance = Number(wallet.balance_ngn ?? wallet.balance ?? 0);
  const customerState = normalizeState(profile.lga || profile.default_zone) || "Lagos";
  const stateIsOperational = operationalStatuses.has(normalizeLaunchStatus(launchStatus));
  const filteredOrders = useMemo(() => {
    if (orderFilter === "all") return orders;
    if (orderFilter === "active") return orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
    return orders.filter((order) => order.status === orderFilter);
  }, [orderFilter, orders]);

  useEffect(() => {
    let mounted = true;
    let removeRealtime: (() => void) | null = null;
    async function load(silent = false) {
      if (!silent) setLoading(true);
      if (!silent) setLoadError(null);
      try {
        const response = await fetch("/api/customer/dashboard", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as CustomerDashboardPayload;
        if (!response.ok) throw new Error(payload.error || "Could not load your dashboard data.");

        if (!mounted) return;
        const nextProfile = payload.profile || { ...fallbackProfile, email: payload.user?.email, phone: payload.user?.phone };
        const selectedState =
          normalizeState(
            nextProfile.lga ||
              payload.appUser?.default_zone ||
              stringMetadata(payload.user?.metadata, "state") ||
              stringMetadata(payload.user?.metadata, "default_zone")
          ) || "Lagos";
        setProfile({ ...nextProfile, lga: selectedState, default_zone: payload.appUser?.default_zone || selectedState });
        setWallet(payload.wallet || { balance_ngn: 0, locked_balance_ngn: 0 });
        const supabase = createClient();
        const { data: launchRow } = await supabase.from("platform_launch_states").select("status").eq("state", selectedState).maybeSingle<{ status?: string | null }>();
        setLaunchStatus(normalizeLaunchStatus(launchRow?.status || (DEFAULT_LIVE_STATES.includes(selectedState as (typeof DEFAULT_LIVE_STATES)[number]) ? "active" : "waitlist")));
        const mergedOrders = mergeLocalDeliveries(payload.orders || [], payload.user?.id || null);
        const hydratedOrders = await enrichOrdersWithRiderDetails(mergedOrders);
        if (!mounted) return;
        setOrders(hydratedOrders);
        setPromotions(payload.promotions || []);
        setAddresses(payload.addresses || []);
        if (!removeRealtime && payload.user?.id) {
          const userId = payload.user.id;
          const channels = [
            supabase
              .channel(`customer-dashboard-deliveries:${userId}`)
              .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `customer_id=eq.${userId}` }, () => void load(true))
              .subscribe(),
            supabase
              .channel(`customer-dashboard-orders:${userId}`)
              .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${userId}` }, () => void load(true))
              .subscribe()
          ];
          removeRealtime = () => channels.forEach((channel) => void supabase.removeChannel(channel));
        }
      } catch (error) {
        if (!mounted) return;
        if (!silent) {
          setOrders([]);
          setPromotions([]);
          setLoadError(error instanceof Error ? error.message : "Could not load your dashboard data.");
        }
      } finally {
        if (mounted && !silent) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => {
      void load(true);
    }, 60000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      removeRealtime?.();
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
      const selectedState = normalizeState(profile.lga || profile.default_zone) || "Lagos";
      await Promise.allSettled([
        supabase.from("profiles").update({ full_name: profile.full_name, phone: profile.phone, avatar_url: profile.avatar_url || null, lga: selectedState, updated_at: new Date().toISOString() }).eq("user_id", user.id),
        supabase.from("users").update({ full_name: profile.full_name, phone: profile.phone, avatar_url: profile.avatar_url || null, default_zone: selectedState, updated_at: new Date().toISOString() }).eq("id", user.id)
      ]);
      const { data: launchRow } = await supabase.from("platform_launch_states").select("status").eq("state", selectedState).maybeSingle<{ status?: string | null }>();
      setLaunchStatus(normalizeLaunchStatus(launchRow?.status || (DEFAULT_LIVE_STATES.includes(selectedState as (typeof DEFAULT_LIVE_STATES)[number]) ? "active" : "waitlist")));
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

  const handleLiveDeliveryChange = useCallback((delivery: { id?: string; rider_id?: string | null; status?: string | null; eta_minutes?: number | null; metadata?: Record<string, unknown> | null }) => {
    if (!delivery.id) return;
    setOrders((current) =>
      current.map((order) =>
        order.id === delivery.id
          ? {
              ...order,
              rider_id: delivery.rider_id === undefined ? order.rider_id : delivery.rider_id,
              status: delivery.status || order.status,
              metadata: delivery.metadata === undefined ? order.metadata : delivery.metadata
            }
          : order
      )
    );
  }, []);

  const handlePickupProofChange = useCallback((deliveryId: string, proof: PickupProof) => {
    const applyProof = (order: OrderRow) => ({
      ...order,
      metadata: {
        ...metadataRecord(order.metadata),
        pickup_proof_required: true,
        pickup_proof: proof
      }
    });
    setOrders((current) => current.map((order) => (order.id === deliveryId ? applyProof(order) : order)));
  }, []);

  async function joinStateWaitlist() {
    setWaitlistMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      await supabase.from("state_waitlist").upsert(
        {
          state: customerState,
          email: profile.email || user?.email || "",
          phone: profile.phone || user?.phone || null,
          status: "waiting",
          updated_at: new Date().toISOString()
        },
        { onConflict: "email,state" }
      );
      setWaitlistMessage(`You're on the ${customerState} early-access list. We'll notify you before operations open.`);
    } catch (error) {
      setWaitlistMessage(error instanceof Error ? error.message : "Could not join the waitlist yet.");
    }
  }

  return (
    <section className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,126,24,0.12),transparent_30%),linear-gradient(180deg,#f8fafc,#eef3f8)] pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl gap-0 lg:grid-cols-[260px_1fr]">
        <DesktopNav activeTab={activeTab} onChange={setActiveTab} />
        <main className="min-w-0 px-4 pb-5 pt-4 sm:px-6 lg:pb-8 lg:pt-6">
          <BackButton className="mb-4" />
          <DashboardHeader title={`${greetingText}, ${firstName}`} subtitle={stateIsOperational ? "" : `Fast Fleets 360 early-access workspace for ${customerState}.`} />
          {activeTab === "home" && !stateIsOperational ? (
            <RolloutStateDashboard profile={profile} state={customerState} status={launchStatus} balance={balance} addresses={addresses} message={waitlistMessage} onNotify={joinStateWaitlist} />
          ) : null}
          {activeTab === "home" && stateIsOperational ? (
            <HomeTab loading={loading} profile={profile} balance={balance} lockedBalance={Number(wallet.locked_balance_ngn || 0)} orders={orders} addresses={addresses} promotions={promotions} loadError={loadError} />
          ) : null}
          {activeTab === "orders" && !stateIsOperational ? <RestrictedOperationsPreview state={customerState} status={launchStatus} /> : null}
          {activeTab === "orders" && stateIsOperational ? (
            <OrdersTab loading={loading} orders={filteredOrders} filter={orderFilter} onFilter={setOrderFilter} />
          ) : null}
          {activeTab === "track" && !stateIsOperational ? <TrackingPreview state={customerState} /> : null}
          {activeTab === "track" && stateIsOperational ? <TrackTab order={trackedOrder} searchCode={searchCode} onSearchCode={setSearchCode} onLiveDeliveryChange={handleLiveDeliveryChange} onPickupProofChange={handlePickupProofChange} /> : null}
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
      <ActiveOrderMessengerSheet orders={orders} hrefForOrder={(order) => messengerHref(order as OrderRow)} />
      <ReviewPrompt subject={reviewSubject} />
    </section>
  );
}

function DashboardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className={cn("mb-5 flex items-center justify-between gap-4 p-4 sm:p-5", customerPanelClass)}>
      <div>
        <h1 className="text-2xl font-black text-fleet-night sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm font-semibold text-slate-600">{subtitle}</p> : null}
      </div>
      <NotificationBell />
    </header>
  );
}

function DesktopNav({ activeTab, onChange }: { activeTab: CustomerTab; onChange: (tab: CustomerTab) => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen border-r border-white/70 bg-white/70 p-4 backdrop-blur-2xl lg:block">
      <div className="rounded-[24px] bg-[linear-gradient(135deg,#08111f,#0f3460)] p-4 text-white shadow-[0_18px_42px_rgba(8,17,31,0.20)]">
        <span className="text-xl font-black">Fast Fleets 360</span>
        <p className="mt-1 text-xs font-semibold text-white/70">Customer app</p>
      </div>
      <nav className="mt-5 grid gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn("flex items-center gap-3 rounded-[18px] px-3 py-3 text-sm font-black transition", activeTab === tab.id ? "bg-fleet-navy text-white shadow-[0_14px_30px_rgba(8,17,31,0.18)]" : "text-slate-600 hover:bg-white hover:shadow-[0_12px_28px_rgba(8,17,31,0.08)]")}>
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
    <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-[24px] border border-white/80 bg-white/90 p-1.5 shadow-[0_18px_48px_rgba(8,17,31,0.18)] backdrop-blur-2xl lg:hidden">
      <Link href="/hub" className="grid min-h-14 place-items-center rounded-[18px] text-[0.7rem] font-black text-slate-500 transition">
        <LayoutDashboard className="h-4 w-4" />
        Hub
      </Link>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn("grid min-h-14 place-items-center rounded-[18px] text-[0.7rem] font-black transition", activeTab === tab.id ? "bg-[#eaf3ff] text-[#1677df] shadow-[inset_0_0_0_1px_rgba(22,119,223,0.10)]" : "text-slate-500")}>
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function RolloutStateDashboard({
  profile,
  state,
  status,
  balance,
  addresses,
  message,
  onNotify
}: {
  profile: ProfileRow;
  state: string;
  status: LaunchStateStatus;
  balance: number;
  addresses: SavedAddress[];
  message: string | null;
  onNotify: () => void;
}) {
  const wave = rolloutWaveForState(state, status);
  return (
    <div className="grid gap-4">
      <Card className="overflow-hidden p-0">
        <div className="relative min-h-[360px] overflow-hidden bg-fleet-night text-white">
          <Image src="https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=1600&q=80" alt="" fill className="object-cover opacity-50" sizes="100vw" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,31,0.96),rgba(8,17,31,0.72)),radial-gradient(circle_at_20%_20%,rgba(244,166,42,0.22),transparent_32%)]" />
          <div className="relative z-10 grid min-h-[360px] content-end p-5 sm:p-7">
            <StatusBadge tone="amber">Launching Soon</StatusBadge>
            <h2 className="mt-4 max-w-3xl text-3xl font-black leading-tight sm:text-5xl">Fast Fleets 360 is preparing operations in {state}</h2>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/[0.78]">
              We&apos;re currently active in Lagos and Ogun State as part of our phased rollout strategy.
              Your account has already been successfully created, and you&apos;ll be among the first users notified once operations begin in your area.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button type="button" onClick={onNotify}>
                <Sparkles className="h-4 w-4" />
                Notify Me
              </Button>
              <LinkButton href="/support" variant="secondary">Talk to support</LinkButton>
            </div>
            {message ? <div className="mt-4 rounded-fleet border border-white/15 bg-white/10 p-3 text-sm font-bold text-white backdrop-blur-xl">{message}</div> : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <RolloutTile icon={MapPin} label="Your state" value={state} body={launchStatusLabel(status)} />
        <RolloutTile icon={Clock3} label="Rollout wave" value={wave} body="Early-access queue" />
        <RolloutTile icon={ShieldCheck} label="Active states" value="Lagos, Ogun" body="Live operations" />
        <RolloutTile icon={Wallet} label="Wallet preview" value={formatMoney(balance)} body="Ready before launch" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card className="p-4">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Available now</span>
          <h3 className="mt-2 text-2xl font-black text-fleet-night">Explore Fast Fleets 360 before launch.</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {["Profile management", "Saved addresses", "Wallet preview", "Pricing previews", "Tracking preview", "Support access"].map((item) => (
              <div key={item} className="rounded-fleet border border-white/70 bg-white/65 p-3 text-sm font-black text-fleet-night shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                {item}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Locked until launch</span>
          <div className="mt-4 grid gap-3">
            {["Booking deliveries", "Requesting riders", "Creating active shipments", "Live logistics operations"].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-fleet border border-fleet-line/80 bg-white/65 p-3 text-sm font-black text-slate-500">
                <LockKeyhole className="h-4 w-4 text-fleet-ember" />
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Account ready</span>
            <h3 className="mt-1 text-xl font-black text-fleet-night">{profile.full_name || "Fast Fleets 360 Customer"}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">{addresses.length} saved address{addresses.length === 1 ? "" : "es"} prepared for launch.</p>
          </div>
          <LinkButton href="/support" variant="secondary">Request early access</LinkButton>
        </div>
      </Card>
    </div>
  );
}

function RolloutTile({ icon: Icon, label, value, body }: { icon: LucideIcon; label: string; value: string; body: string }) {
  return (
    <Card className="p-3">
      <Icon className="h-4 w-4 text-fleet-ember" />
      <p className="mt-3 text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <strong className="mt-1 block text-lg font-black text-fleet-night">{value}</strong>
      <span className="mt-1 block text-xs font-bold text-slate-500">{body}</span>
    </Card>
  );
}

function RestrictedOperationsPreview({ state, status }: { state: string; status: LaunchStateStatus }) {
  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <StatusBadge tone="amber">{launchStatusLabel(status)}</StatusBadge>
        <h2 className="mt-3 text-2xl font-black text-fleet-night">Delivery creation is paused for {state}.</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          Your account is active, but live shipments open when Fast Fleets 360 operations launch in your area.
        </p>
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        {["Food delivery access", "Parcel dispatch access", "Business logistics access"].map((item) => (
          <Card key={item} className="p-4">
            <LockKeyhole className="h-5 w-5 text-fleet-ember" />
            <h3 className="mt-3 text-lg font-black text-fleet-night">{item}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">This module is ready and will activate for {state} during rollout.</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TrackingPreview({ state }: { state: string }) {
  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-fleet-ember"><Radar className="h-4 w-4" /> Tracking preview</span>
        <h2 className="mt-3 text-2xl font-black text-fleet-night">Live tracking will activate when {state} opens.</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Preview how rider status, ETA, pickup, and drop-off movement will appear once operations begin.</p>
      </Card>
      <RoutePreview label="Rollout route preview" status="launching_soon" riderName="Fast Fleets 360 rollout rider" pickupAddress={`${state} pickup zone`} dropoffAddress={`${state} delivery zone`} />
    </div>
  );
}

function HomeTab({
  loading,
  profile,
  balance,
  lockedBalance,
  orders,
  addresses,
  promotions,
  loadError
}: {
  loading: boolean;
  profile: ProfileRow;
  balance: number;
  lockedBalance: number;
  orders: OrderRow[];
  addresses: SavedAddress[];
  promotions: PromotionRow[];
  loadError: string | null;
}) {
  if (loading) return <DashboardSkeleton />;
  const completedOrders = orders.filter((order) => order.status === "delivered");
  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  const walletTrackHref = activeOrders[0] ? trackHref(activeOrders[0]) : orders[0] ? trackHref(orders[0]) : "/track";
  const monthlySpend = orders
    .filter((order) => {
      const createdAt = new Date(order.created_at);
      const now = new Date();
      return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
    })
    .reduce((sum, order) => sum + Number(order.price_ngn || 0), 0);
  return (
    <div className="grid gap-5">
      {loadError ? <div className="rounded-[18px] border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700 shadow-[0_12px_28px_rgba(185,28,28,0.08)]">{loadError}</div> : null}
      <div id="wallet">
        <WalletDashboardCard
          userName={profile.full_name?.trim().split(/\s+/)[0] || "there"}
          balance={balance}
          lockedBalance={lockedBalance}
          walletType="customer"
          accountKind="customer"
          kycStatus={profile.kyc_status === "approved" ? "verified" : profile.kyc_status === "rejected" ? "more_info_needed" : "pending"}
          returnTo="/dashboard"
          trackHref={walletTrackHref}
          transactionHref="/dashboard#transactions"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="This month" value={formatMoney(monthlySpend)} />
        <SummaryTile label="Active orders" value={String(activeOrders.length)} />
        <SummaryTile label="Completed" value={String(completedOrders.length)} />
        <SummaryTile label="Saved places" value={String(addresses.length)} />
      </div>

      <section className={cn("overflow-hidden p-4 sm:p-5", customerSoftPanelClass)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black text-fleet-night">Promotions</h2>
          <StatusBadge tone="blue">{promotions.length} live</StatusBadge>
        </div>
        {promotions.length ? (
          <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto">
            {promotions.map((promotion) => (
              <Card key={promotion.id} className="min-w-[82%] snap-start overflow-hidden rounded-[22px] border-white/80 bg-white/90 p-4 shadow-[0_16px_42px_rgba(8,17,31,0.10)] sm:min-w-[360px]">
                <div className="relative h-28 overflow-hidden rounded-[18px] bg-[linear-gradient(135deg,rgba(15,52,96,0.96),rgba(244,126,24,0.72))]">
                  <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/15 blur-xl" />
                  <div className="absolute bottom-3 left-3 rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.14em] text-white">Fast Fleets</div>
                </div>
                <h3 className="mt-4 text-lg font-black text-fleet-night">{promotion.title}</h3>
                <LinkButton href={promotion.cta_url || "/book"} size="sm" className="mt-4">{promotion.cta_label || "Open"}</LinkButton>
              </Card>
            ))}
          </div>
        ) : (
          <DashboardEmptyState title="No promotions yet" body="Fresh offers will appear here when Fast Fleets 360 publishes them." ctaLabel="View updates" ctaHref="/updates" icon={<Bell className="h-7 w-7" />} />
        )}
      </section>

      <TransactionHistory accountKind="customer" compact />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="relative overflow-hidden rounded-[22px] border-white/80 bg-white/[0.92] p-4 shadow-[0_16px_42px_rgba(8,17,31,0.08)]">
      <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-[36px] bg-[linear-gradient(135deg,rgba(244,126,24,0.16),rgba(15,52,96,0.08))]" />
      <p className="relative text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <strong className="relative mt-2 block text-xl font-black text-fleet-night">{value}</strong>
    </Card>
  );
}

function trackHref(order: OrderRow) {
  if (isLocalOrder(order)) return publicTrackingHref(order.delivery_code || order.id);
  return accountTrackingHref(order.delivery_code || order.id);
}

function messengerHref(order: OrderRow) {
  if (isLocalOrder(order)) return publicTrackingHref(order.delivery_code || order.id);
  return accountMessengerHref(order.delivery_code || order.id);
}

function isLocalOrder(order: OrderRow) {
  return String(order.id || "").startsWith("local-");
}

function detailsHref(order: OrderRow) {
  return `/delivery/details?code=${encodeURIComponent(order.delivery_code)}`;
}

function ProfileImage({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  if (src) {
    return <Image src={src} alt="" width={96} height={96} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return <span className={cn("grid shrink-0 place-items-center rounded-full bg-fleet-navy font-black text-white", className)}>{initials(name)}</span>;
}

function OrdersTab({ loading, orders, filter, onFilter }: { loading: boolean; orders: OrderRow[]; filter: "all" | "active" | "delivered" | "cancelled"; onFilter: (filter: "all" | "active" | "delivered" | "cancelled") => void }) {
  if (loading) return <DashboardSkeleton />;
  return (
    <div className="grid gap-4">
      <div className={cn("no-scrollbar flex gap-2 overflow-x-auto p-2", customerSoftPanelClass)}>
        {(["all", "active", "delivered", "cancelled"] as const).map((item) => (
          <button key={item} type="button" onClick={() => onFilter(item)} className={cn("rounded-full px-4 py-2 text-sm font-black capitalize transition", filter === item ? "bg-fleet-navy text-white shadow-[0_12px_26px_rgba(8,17,31,0.18)]" : "bg-white/80 text-slate-600 hover:bg-white")}>{item}</button>
        ))}
      </div>
      {orders.length ? (
        <div className="grid gap-3">{orders.map((order) => <OrderRowCard key={order.id} order={order} />)}</div>
      ) : (
        <DashboardEmptyState title="No orders found" body="Try another filter or book a new delivery." ctaLabel="Book delivery" ctaHref="/book" />
      )}
    </div>
  );
}

function OrderRowCard({ order, compact }: { order: OrderRow; compact?: boolean }) {
  const businessOrder = isBusinessMarketplaceOrder(order);
  const liveDelivery = hasLiveDelivery(order);
  const routeLabel = orderRouteLabel(order);
  return (
    <article className="rounded-[22px] border border-white/80 bg-white/[0.92] p-4 shadow-[0_16px_42px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/30 backdrop-blur-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-500">{formatDateTime(order.created_at)}</p>
          <h3 className="mt-1 text-sm font-black text-fleet-night">{order.delivery_code}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{routeLabel}</p>
        </div>
        <StatusBadge tone={statusTone(order.status)}>{customerOrderLabel(String(order.status))}</StatusBadge>
      </div>
      {businessOrder && !liveDelivery ? <CustomerVendorProgress status={String(order.status)} compact /> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm font-black text-fleet-night">{formatMoney(order.price_ngn)}</strong>
        <div className="flex gap-2">
          {!compact ? (
            businessOrder && !liveDelivery ? <LinkButton href={messengerHref(order)} size="sm" variant="secondary">View details</LinkButton> : <LinkButton href={detailsHref(order)} size="sm" variant="secondary">View details</LinkButton>
          ) : null}
          <LinkButton href={messengerHref(order)} size="sm" variant="secondary">
            <MessageCircle className="h-3.5 w-3.5" />
            {businessOrder && !liveDelivery ? "Status updates" : "Messenger"}
          </LinkButton>
          <LinkButton href={`/book?reorder=${order.delivery_code}`} size="sm">Re-order</LinkButton>
        </div>
      </div>
    </article>
  );
}

function TrackTab({ order, searchCode, onSearchCode, onLiveDeliveryChange, onPickupProofChange }: { order: OrderRow | null; searchCode: string; onSearchCode: (value: string) => void; onLiveDeliveryChange: (delivery: { id?: string; rider_id?: string | null; status?: string | null; metadata?: Record<string, unknown> | null }) => void; onPickupProofChange: (deliveryId: string, proof: PickupProof) => void }) {
  const steps = ["Booked", "Rider assigned", "Picked up", "In transit", "Delivered"];
  const currentStep = order ? customerStepIndex(order.status) : 0;
  const vendorOrder = order && isBusinessMarketplaceOrder(order) && !hasLiveDelivery(order);
  return (
    <div className="grid gap-5">
      <label className={cn("form-field p-4", customerSoftPanelClass)}>
        <span className="form-label">Enter order ID</span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="form-input pl-10" value={searchCode} onChange={(event) => onSearchCode(event.target.value)} placeholder="FF-240911" />
        </div>
      </label>
      {order ? (
        <>
          <Card className={cn("p-5", customerPanelClass)}>
            <h2 className="text-xl font-black text-fleet-night">{order.delivery_code}</h2>
            {vendorOrder ? (
              <CustomerVendorProgress status={String(order.status)} />
            ) : (
              <div className="mt-5 grid gap-4">
                {steps.map((step, index) => (
                  <div key={step} className="flex items-center gap-3">
                    <span className={cn("h-5 w-5 rounded-full border-4", index <= currentStep ? "border-fleet-navy bg-fleet-navy" : "border-slate-200 bg-white")} />
                    <span className="text-sm font-black text-fleet-night">{step}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          {!vendorOrder ? <PackagePickupProof deliveryId={order.id} metadata={order.metadata} status={String(order.status)} onProofChange={(proof) => onPickupProofChange(order.id, proof)} /> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <LinkButton href={messengerHref(order)} className="w-full bg-fleet-navy hover:bg-fleet-night">
              <MessageCircle className="h-4 w-4" />
              Open messenger
            </LinkButton>
            <LinkButton href={trackHref(order)} variant="secondary" className="w-full">
              Full tracking
            </LinkButton>
          </div>
          {!vendorOrder ? (
            <DeliveryRouteMap
              label="Live delivery map"
              order={order}
              onLiveDeliveryChange={onLiveDeliveryChange}
            />
          ) : null}
          {!vendorOrder ? <Card className={cn("p-5", customerPanelClass)}>
            <div className="flex items-center gap-3">
              <ProfileImage src={order.rider_profiles?.users?.avatar_url} name={order.rider_profiles?.users?.full_name || "Driver"} className="h-14 w-14" />
              <div>
                <h3 className="text-lg font-black text-fleet-night">Driver info</h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">{order.rider_profiles?.users?.full_name || "Driver assigned"} · Rating 4.9 · {order.rider_profiles?.vehicle_type || "bike"} · {order.rider_id ? riderAccountTypeLabel(order.rider_profiles?.rider_account_type) : "Driver tag pending"}</p>
              </div>
            </div>
            <LinkButton href={`tel:${order.rider_profiles?.users?.phone || ""}`} className="mt-4 w-full">Call driver</LinkButton>
          </Card> : null}
        </>
      ) : (
        <DashboardEmptyState title="No active order to track" body="Enter an order ID or book a delivery to see live movement." ctaLabel="Book delivery" ctaHref="/book" />
      )}
    </div>
  );
}

function customerStepIndex(status: string) {
  if (["delivered"].includes(status)) return 4;
  if (["in_transit", "awaiting_delivery_confirmation"].includes(status)) return 3;
  if (["picked_up"].includes(status)) return 2;
  if (["assigned", "accepted", "rider_arrived"].includes(status)) return 1;
  return 0;
}

function CustomerVendorProgress({ status, compact = false }: { status: string; compact?: boolean }) {
  const steps = [
    ["received", "Order Received"],
    ["preparing", "Preparing Order"],
    ["packing", "Packing Order"],
    ["ready_for_pickup", "Ready for Pickup"],
    ["rider_assigned", "Rider Assigned"],
    ["picked_up", "Order Picked by Dispatch"],
    ["in_transit", "On the Way"],
    ["awaiting_delivery_confirmation", "Confirming Delivery"],
    ["delivered", "Delivered"]
  ] as const;
  const index = Math.max(0, steps.findIndex(([value]) => value === status));
  return (
    <div className={cn("grid gap-3", compact ? "mt-3" : "mt-5")}>
      {steps.map(([value, label], stepIndex) => {
        const active = stepIndex <= index || !businessOrderStatuses.has(status);
        return (
          <div key={value} className="flex items-center gap-3">
            <span className={cn("h-4 w-4 rounded-full border-2", active ? "border-emerald-600 bg-emerald-600" : "border-slate-200 bg-white")} />
            <span className={cn("text-xs font-black sm:text-sm", active ? "text-fleet-night" : "text-slate-400")}>{label}</span>
          </div>
        );
      })}
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
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(profile.avatar_url ? null : "Upload a profile picture so drivers can see who ordered.");

  async function handleProfilePhoto(file: File | null) {
    if (!file) return;
    setPhotoLoading(true);
    setPhotoMessage("Uploading profile picture...");
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to upload your profile picture.");
      const upload = await uploadProfilePhoto(user.id, file);
      await Promise.allSettled([
        supabase.from("profiles").update({ avatar_url: upload.publicUrl, updated_at: new Date().toISOString() }).eq("user_id", user.id),
        supabase.from("users").update({ avatar_url: upload.publicUrl, updated_at: new Date().toISOString() }).eq("id", user.id)
      ]);
      onProfile({ ...profile, avatar_url: upload.publicUrl });
      setPhotoMessage("Profile picture updated.");
    } catch (error) {
      setPhotoMessage(error instanceof Error ? error.message : "Could not upload profile picture.");
    } finally {
      setPhotoLoading(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card className={cn("p-5", customerPanelClass)}>
        <div className="flex items-center gap-4">
          <ProfileImage src={profile.avatar_url} name={profile.full_name || "Fast Fleets 360 Customer"} className="h-16 w-16 text-lg" />
          <div>
            <h2 className="text-xl font-black text-fleet-night">{profile.full_name || "Fast Fleets 360 Customer"}</h2>
            <p className="text-sm font-semibold text-slate-500">{profile.email || "No email"} · {profile.phone || "No phone"}</p>
            <label className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-fleet border border-white/70 bg-white/90 px-3 py-2 text-xs font-black text-fleet-night shadow-[0_10px_26px_rgba(8,17,31,0.08)]">
              {photoLoading ? "Uploading..." : profile.avatar_url ? "Change profile picture" : "Upload profile picture"}
              <input className="sr-only" type="file" accept="image/*" onChange={(event) => handleProfilePhoto(event.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
        {photoMessage ? <div className="mt-4 rounded-fleet bg-fleet-paper p-3 text-xs font-bold leading-5 text-slate-600">{photoMessage}</div> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={profile.full_name || ""} onChange={(value) => onProfile({ ...profile, full_name: value })} />
          <Field label="Phone" value={profile.phone || ""} onChange={(value) => onProfile({ ...profile, phone: value })} />
          <Field label="Email" value={profile.email || ""} onChange={(value) => onProfile({ ...profile, email: value })} readOnly />
          <label className="form-field">
            <span className="form-label">State</span>
            <select className="form-input" value={normalizeState(profile.lga || profile.default_zone) || "Lagos"} onChange={(event) => onProfile({ ...profile, lga: event.target.value, default_zone: event.target.value })}>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </label>
        </div>
        {message ? <div className="mt-3 rounded-fleet bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</div> : null}
        <Button type="button" disabled={saving} className="mt-5 w-full bg-fleet-navy hover:bg-fleet-night" onClick={onSaveProfile}>Save profile</Button>
      </Card>
      <Card className={cn("p-5", customerPanelClass)}>
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
      <Card className={cn("p-5", customerPanelClass)}>
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
      <Card className={cn("p-5", customerPanelClass)}>
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

function DeliveryRouteMap({
  order,
  compact,
  className,
  label,
  onLiveDeliveryChange
}: {
  order: OrderRow | null;
  compact?: boolean;
  className?: string;
  label: string;
  onLiveDeliveryChange: (delivery: { id?: string; rider_id?: string | null; status?: string | null; metadata?: Record<string, unknown> | null }) => void;
}) {
  const { delivery, riderLocation } = useLiveDeliveryTracking({
    deliveryId: order?.id,
    riderId: order?.rider_id,
    onDeliveryChange: onLiveDeliveryChange
  });

  return (
    <RoutePreview
      compact={compact}
      className={className}
      label={label}
      status={delivery?.status || order?.status}
      riderName={order?.rider_profiles?.users?.full_name || "Fast Fleets 360 driver"}
      pickupAddress={order?.pickup_address || "Victoria Island, Lagos"}
      dropoffAddress={order?.dropoff_address || "Ikeja GRA, Lagos"}
      riderLocation={riderLocation}
      riderAvatarUrl={order?.rider_profiles?.users?.avatar_url}
    />
  );
}

function mergeLocalDeliveries(serverOrders: OrderRow[], currentUserId: string | null) {
  if (typeof window === "undefined") return serverOrders;
  const localOrders = readLocalDeliveries(currentUserId);
  if (!localOrders.length) return serverOrders;
  const seen = new Set(serverOrders.map((order) => order.delivery_code?.toUpperCase()));
  return [
    ...serverOrders,
    ...localOrders.filter((order) => !seen.has(order.delivery_code.toUpperCase()))
  ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

function readLocalDeliveries(currentUserId: string | null): OrderRow[] {
  if (!currentUserId) return [];
  try {
    const stored = JSON.parse(localStorage.getItem("fastfleet.next.deliveries") || "[]") as LocalDelivery[];
    const ownedEntries = stored.filter((item) => localDeliveryOwnerId(item));
    if (ownedEntries.length !== stored.length) {
      localStorage.setItem("fastfleet.next.deliveries", JSON.stringify(ownedEntries));
    }
    return ownedEntries
      .filter((item) => localDeliveryOwnerId(item) === currentUserId)
      .filter((item) => item.delivery_code)
      .map((item, index) => ({
        id: item.id || `local-${item.delivery_code || index}`,
        rider_id: item.rider_id || null,
        delivery_code: String(item.delivery_code).toUpperCase(),
        pickup_address: displayAddress(item.pickup_address || item.pickup || "", item.source?.includes("restaurant") ? "Restaurant pickup" : "Marketplace pickup"),
        dropoff_address: displayAddress(item.dropoff_address || item.dropoff || "", "Customer delivery address"),
        status: item.status || "searching",
        price_ngn: Number(item.price_ngn || item.estimate?.total || 0),
        source: item.source || null,
        marketplace_kind: item.marketplace_kind || null,
        items: item.items || null,
        created_at: item.created_at || new Date().toISOString(),
        delivered_at: item.delivered_at || null,
        proof_url: item.proof_url || null,
        metadata: item.metadata || null,
        rider_profiles: item.rider_profiles || null
      }));
  } catch {
    return [];
  }
}

function localDeliveryOwnerId(item: LocalDelivery) {
  return typeof item.user_id === "string" && item.user_id.trim()
    ? item.user_id.trim()
    : typeof item.customer_id === "string" && item.customer_id.trim()
      ? item.customer_id.trim()
      : "";
}

function orderRouteLabel(order: Pick<OrderRow, "pickup_address" | "dropoff_address">) {
  return `${displayAddress(order.pickup_address, "Pickup address")} to ${displayAddress(order.dropoff_address, "Drop-off address")}`;
}

function displayAddress(value: string | undefined | null, fallback: string) {
  return sanitizeAddressText(value || "") || fallback;
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
