"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { BarChart3, Building2, Clock, Download, FileText, Home, LayoutDashboard, Loader2, MapPin, PackageCheck, Plus, ShieldCheck, Store, Upload, UserRound, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, initials } from "@/lib/format";
import { NIGERIAN_STATES, normalizeState } from "@/lib/launch-states";
import { marketplaceBusinessTypeLabel } from "@/lib/marketplace-listing";
import { uploadProfilePhoto } from "@/lib/storage";
import { AccountDeletionButton } from "@/components/dashboard/account-deletion";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { ReviewPrompt } from "@/components/reviews/review-prompt";
import { TransactionHistory } from "@/components/wallet/transaction-history";
import { WalletDashboardCard } from "@/components/wallet/wallet-dashboard-card";
import { RoutePreview } from "@/components/maps/route-preview";
import { BackButton } from "@/components/ui/back-button";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { accountTrackingHref } from "@/lib/tracking-links";

type BusinessTab = "overview" | "dispatch" | "history" | "analytics" | "account";
type BusinessKycStatus = "submitted" | "active" | "paused" | "rejected";

type BusinessProfile = {
  id?: string | null;
  business_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  industry?: string | null;
  business_type?: string | null;
  commission_rate?: number | null;
  operating_state?: string | null;
  default_zone?: string | null;
  pickup_address?: string | null;
  cac_number?: string | null;
  registration_status?: BusinessKycStatus | null;
  rejection_reason?: string | null;
};

type DeliveryRow = {
  id: string;
  delivery_code: string;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  price_ngn: number;
  created_at: string;
  proof_url?: string | null;
};

type BusinessOrderRow = {
  id: string;
  order_code?: string | null;
  delivery_id?: string | null;
  marketplace_kind?: string | null;
  items?: Array<{ name?: string; productName?: string; quantity?: number; subtotal?: number; store?: string; vendorName?: string }> | null;
  customer_contact?: string | null;
  pickup_address: string;
  dropoff_address: string;
  package_type: string;
  vehicle_type: string;
  vehicle_subtype?: string | null;
  status: string;
  amount: number;
  payment_status?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type SavedAddress = {
  id: string;
  label: string;
  address: string;
};

type TeamMember = {
  id: string;
  email: string;
  role: "dispatcher" | "viewer";
  status?: string;
};

type WithdrawalRow = {
  id: string;
  amount_ngn: number;
  bank_name: string;
  account_number: string;
  account_name?: string | null;
  status: string;
  created_at: string;
};

type BulkRow = {
  sender_name: string;
  sender_phone: string;
  pickup_address: string;
  recipient_name: string;
  recipient_phone: string;
  dropoff_address: string;
  package_type: string;
  error?: string;
};

const tabs: Array<{ id: BusinessTab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "dispatch", label: "Dispatch", icon: Plus },
  { id: "history", label: "History", icon: Clock },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "account", label: "Account", icon: UserRound }
];

const defaultDispatch = {
  senderName: "",
  senderPhone: "",
  pickupAddress: "",
  recipientName: "",
  recipientPhone: "",
  dropoffAddress: "",
  packageType: "Parcel",
  instructions: "",
  vehicleType: "Any",
  scheduleMode: "Now",
  scheduledAt: "",
  payment: "wallet"
};

type DispatchForm = typeof defaultDispatch;

const businessOrderSelect =
  "id, order_code, delivery_id, marketplace_kind, items, customer_contact, pickup_address, dropoff_address, package_type, vehicle_type, vehicle_subtype, status, amount, payment_status, created_at, updated_at";

async function loadBusinessOrdersForProfile(supabase: ReturnType<typeof createClient>, businessProfileId?: string | null, userId?: string | null) {
  let apiOrders: BusinessOrderRow[] = [];
  let apiError: string | null = null;

  try {
    const response = await fetch("/api/business/orders", { cache: "no-store" });
    const payload = await response.json().catch(() => ({ orders: [] }));
    if (response.ok) {
      apiOrders = ((payload.orders || []) as BusinessOrderRow[]).filter(Boolean);
      if (apiOrders.length || (!businessProfileId && !userId)) return { orders: apiOrders, error: null };
    } else {
      apiError = typeof payload.error === "string" ? payload.error : "Could not load marketplace orders.";
    }
  } catch (error) {
    apiError = error instanceof Error ? error.message : "Could not load marketplace orders.";
  }

  const filters = [
    businessProfileId ? `business_profile_id.eq.${businessProfileId}` : null,
    userId ? `business_id.eq.${userId}` : null
  ].filter((filter): filter is string => Boolean(filter));

  if (!filters.length) return { orders: apiOrders, error: apiError };

  const { data, error } = await supabase
    .from("orders")
    .select(businessOrderSelect)
    .or(filters.join(","))
    .neq("payment_status", "pending")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) return { orders: apiOrders, error: apiOrders.length ? null : error.message || apiError };
  return { orders: ((data || []) as BusinessOrderRow[]).filter(Boolean), error: null };
}

function estimatePrice(form: DispatchForm) {
  const base = form.vehicleType === "Van" ? 7000 : form.vehicleType === "Car" ? 4500 : form.vehicleType === "Bike" ? 2500 : 3200;
  return base + Math.max(1800, (form.pickupAddress.length + form.dropoffAddress.length) * 65);
}

export function BusinessDashboard({ initialKycStatus = "active", initialKycRejectionReason = null }: { initialKycStatus?: BusinessKycStatus; initialKycRejectionReason?: string | null }) {
  const [activeTab, setActiveTab] = useState<BusinessTab>("overview");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BusinessProfile>({ business_name: "Fast Fleets 360 Business", contact_name: "Operations", phone: "+2348012345678" });
  const [kycStatus, setKycStatus] = useState<BusinessKycStatus>(initialKycStatus);
  const [kycRejectionReason, setKycRejectionReason] = useState<string | null>(initialKycRejectionReason);
  const [walletBalance, setWalletBalance] = useState(0);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [orders, setOrders] = useState<DeliveryRow[]>([]);
  const [businessOrders, setBusinessOrders] = useState<BusinessOrderRow[]>([]);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [dispatch, setDispatch] = useState<DispatchForm>(defaultDispatch);
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [businessOrderLoading, setBusinessOrderLoading] = useState<string | null>(null);
  const [businessOrderError, setBusinessOrderError] = useState<string | null>(null);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [addressDraft, setAddressDraft] = useState({ label: "", address: "" });
  const [historyStatus, setHistoryStatus] = useState("all");
  const [teamEmail, setTeamEmail] = useState("");
  const [teamRole, setTeamRole] = useState<"dispatcher" | "viewer">("dispatcher");
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [prefs, setPrefs] = useState({ email: true, sms: true, wallet: true });
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalMessage, setWithdrawalMessage] = useState<string | null>(null);
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);

  const stats = useMemo(() => {
    const today = orders.filter((order) => new Date(order.created_at).toDateString() === new Date().toDateString()).length;
    const monthSpend = orders.reduce((sum, order) => sum + Number(order.price_ngn || 0), 0);
    const active = orders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length;
    return { today, monthSpend, active, addresses: addresses.length };
  }, [addresses.length, orders]);
  const filteredOrders = historyStatus === "all" ? orders : orders.filter((order) => order.status === historyStatus);
  const completedBusinessOrder = useMemo(() => businessOrders.find((order) => String(order.status) === "delivered") || null, [businessOrders]);
  const completedDispatchOrder = useMemo(() => orders.find((order) => String(order.status) === "delivered") || null, [orders]);
  const reviewSubject = useMemo(() => {
    if (completedBusinessOrder) {
      return {
        reviewerRole: "business" as const,
        subjectType: "business_order" as const,
        orderId: completedBusinessOrder.id,
        deliveryId: completedBusinessOrder.delivery_id || null,
        targetBusinessProfileId: profile.id || null,
        title: "How was this marketplace order?",
        body: "Rate the order flow so operations can improve fulfillment quality.",
        metadata: {
          order_code: completedBusinessOrder.order_code || null,
          marketplace_kind: completedBusinessOrder.marketplace_kind || null
        }
      };
    }
    if (!completedDispatchOrder) return null;
    return {
      reviewerRole: "business" as const,
      subjectType: "business_order" as const,
      deliveryId: completedDispatchOrder.id,
      targetBusinessProfileId: profile.id || null,
      title: "How was this completed dispatch?",
      body: "Your feedback helps us improve rider assignment and delivery reliability.",
      metadata: {
        delivery_code: completedDispatchOrder.delivery_code
      }
    };
  }, [completedBusinessOrder, completedDispatchOrder, profile.id]);

  useEffect(() => {
    let mounted = true;
    let removeOrderChannel: (() => void) | undefined;
    async function load(silent = false, subscribeToOrders = false) {
      if (!silent) setLoading(true);
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) return;

        let businessQuery = supabase.from("business_profiles").select("id, business_name, contact_name, phone, email, industry, business_type, commission_rate, operating_state, pickup_address, cac_number, registration_status, rejection_reason").eq("user_id", user.id).maybeSingle();
        const [businessResult, accountProfileResult, appUserResult, walletResult, ordersResult, addressResult, teamResult, withdrawalsResult] = await Promise.all([
          businessQuery,
          supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle(),
          supabase.from("users").select("default_zone").eq("id", user.id).maybeSingle<{ default_zone?: string | null }>(),
          supabase.from("wallets").select("balance_ngn").eq("user_id", user.id).eq("wallet_type", "customer").maybeSingle(),
          supabase.from("deliveries").select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, created_at, proof_url").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(50),
          supabase.from("saved_addresses").select("id, label, address").eq("user_id", user.id).order("created_at", { ascending: false }),
          fetch("/api/business/team").then((response) => response.json()).catch(() => ({ members: [] })),
          fetch("/api/wallet/withdrawals?accountKind=business", { cache: "no-store" }).then((response) => response.json()).catch(() => ({ withdrawals: [] }))
        ]);
        if (!mounted) return;
        let nextProfile = (businessResult.data || profile) as BusinessProfile;
        if (businessResult.error) {
          const fallback = await supabase.from("business_profiles").select("id, business_name, contact_name, phone, email, industry, pickup_address, cac_number, registration_status").eq("user_id", user.id).maybeSingle();
          nextProfile = (fallback.data || profile) as BusinessProfile;
        }
        const nextState = normalizeState(nextProfile.operating_state || (appUserResult.data as { default_zone?: string | null } | null)?.default_zone) || null;
        const nextKycStatus = nextProfile.registration_status || initialKycStatus;
        setProfile({ ...nextProfile, operating_state: nextState, default_zone: nextState, avatar_url: (accountProfileResult.data as { avatar_url?: string | null } | null)?.avatar_url || nextProfile.avatar_url || null });
        setKycStatus(nextKycStatus);
        setKycRejectionReason(nextProfile.rejection_reason || initialKycRejectionReason);
        if (!silent && nextKycStatus === "active" && !nextState) setActiveTab("account");
        setWalletBalance(Number((walletResult.data as { balance_ngn?: number } | null)?.balance_ngn || 0));
        setWithdrawals(Array.isArray(withdrawalsResult.withdrawals) ? withdrawalsResult.withdrawals : []);
        setOrders(ordersResult.error ? [] : ((ordersResult.data || []) as DeliveryRow[]));
        const businessOrdersResult = await loadBusinessOrdersForProfile(supabase, nextProfile.id, user.id);
        if (!mounted) return;
        setBusinessOrders(businessOrdersResult.orders);
        setBusinessOrderError(businessOrdersResult.error);
        setAddresses((addressResult.data || []) as SavedAddress[]);
        setTeam((teamResult.members || []) as TeamMember[]);
        if (!silent) {
          setDispatch((current) => ({
            ...current,
            senderName: nextProfile.contact_name || "",
            senderPhone: nextProfile.phone || "",
            pickupAddress: nextProfile.pickup_address || ""
          }));
        }
        if (!subscribeToOrders) return;
        const businessProfileId = nextProfile.id;
        const orderChannels: RealtimeChannel[] = [];
        if (businessProfileId) {
          orderChannels.push(
            supabase
              .channel(`business-orders:${businessProfileId}`)
              .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_profile_id=eq.${businessProfileId}` }, () => {
                void fetchBusinessOrders(businessProfileId, user.id);
              })
              .subscribe()
          );
        }
        orderChannels.push(
          supabase
            .channel(`business-orders-user:${user.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${user.id}` }, () => {
              void fetchBusinessOrders(businessProfileId, user.id);
            })
            .subscribe()
        );
        if (orderChannels.length) {
          removeOrderChannel = () => {
            orderChannels.forEach((channel) => {
              supabase.removeChannel(channel);
            });
          };
        }
      } catch (error) {
        if (mounted && !silent) setDispatchMessage(error instanceof Error ? error.message : "Could not load business dashboard.");
      } finally {
        if (mounted && !silent) setLoading(false);
      }
    }
    void load(false, true);
    const timer = window.setInterval(() => {
      void load(true);
    }, 15000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      removeOrderChannel?.();
    };
  }, []);

  async function fetchBusinessOrders(businessProfileId = profile.id, userId?: string | null) {
    setBusinessOrderError(null);
    const result = await loadBusinessOrdersForProfile(createClient(), businessProfileId, userId);
    setBusinessOrders(result.orders);
    setBusinessOrderError(result.error);
  }

  async function updateBusinessOrder(id: string, status: string) {
    setBusinessOrderLoading(`${id}:${status}`);
    setDispatchMessage(null);
    try {
      const response = await fetch("/api/business/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not update business order.");
      setBusinessOrders((current) => current.map((order) => (order.id === id ? (payload.order as BusinessOrderRow) : order)));
      if (status === "ready_for_pickup") {
        await fetchBusinessOrders(profile.id);
        setDispatchMessage("Dispatch request sent to available riders.");
      }
    } catch (error) {
      setDispatchMessage(error instanceof Error ? error.message : "Could not update business order.");
    } finally {
      setBusinessOrderLoading(null);
    }
  }

  async function submitDispatch() {
    setDispatchMessage(null);
    if (!dispatch.senderName || !dispatch.senderPhone || !dispatch.pickupAddress || !dispatch.recipientName || !dispatch.recipientPhone || !dispatch.dropoffAddress) {
      setDispatchMessage("Complete sender, recipient, pickup, and drop-off details.");
      return;
    }
    setDispatchLoading(true);
    try {
      const response = await fetch("/api/business/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dispatch)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create dispatch.");
      setOrders((current) => [payload.delivery as DeliveryRow, ...current]);
      setDispatch(defaultDispatch);
      setDispatchMessage("Dispatch created in Supabase.");
    } catch (error) {
      setDispatchMessage(error instanceof Error ? error.message : "Could not create dispatch.");
    } finally {
      setDispatchLoading(false);
    }
  }

  function parseCsv(text: string) {
    const [headerLine, ...lines] = text.trim().split(/\r?\n/);
    const headers = headerLine.split(",").map((item) => item.trim());
    const required = ["sender_name", "sender_phone", "pickup_address", "recipient_name", "recipient_phone", "dropoff_address", "package_type"];
    const rows = lines.map((line) => {
      const values = line.split(",").map((item) => item.trim());
      const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
      const error = required.find((key) => !record[key]) ? "Missing required value" : undefined;
      return {
        sender_name: record.sender_name || "",
        sender_phone: record.sender_phone || "",
        pickup_address: record.pickup_address || "",
        recipient_name: record.recipient_name || "",
        recipient_phone: record.recipient_phone || "",
        dropoff_address: record.dropoff_address || "",
        package_type: record.package_type || "",
        error
      };
    });
    setBulkRows(rows);
  }

  function downloadTemplate() {
    const csv = "sender_name,sender_phone,pickup_address,recipient_name,recipient_phone,dropoff_address,package_type\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "fastfleet-bulk-dispatch-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function dispatchBulk() {
    const validRows = bulkRows.filter((row) => !row.error);
    if (!validRows.length) return;
    setDispatchLoading(true);
    setDispatchMessage(null);
    try {
      const response = await fetch("/api/business/dispatch/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create bulk dispatches.");
      setOrders((current) => [...(payload.deliveries as DeliveryRow[]), ...current]);
      setBulkRows([]);
      setDispatchMessage(`${payload.deliveries.length} dispatches created in Supabase.`);
    } catch (error) {
      setDispatchMessage(error instanceof Error ? error.message : "Could not create bulk dispatches.");
    } finally {
      setDispatchLoading(false);
    }
  }

  async function addAddress() {
    if (!addressDraft.label || !addressDraft.address) return;
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from("saved_addresses").insert({ user_id: user.id, label: addressDraft.label, address: addressDraft.address }).select("id, label, address").single();
      if (error) throw error;
      setAddresses((current) => [data as SavedAddress, ...current]);
      setAddressDraft({ label: "", address: "" });
    } catch (error) {
      setDispatchMessage(error instanceof Error ? error.message : "Could not save address.");
    }
  }

  async function deleteAddress(id: string) {
    setAddresses((current) => current.filter((item) => item.id !== id));
    try {
      const supabase = createClient();
      await supabase.from("saved_addresses").delete().eq("id", id);
    } catch {
      // Keep the local UI responsive when remote business data is delayed.
    }
  }

  async function inviteTeamMember() {
    if (!teamEmail.includes("@")) return;
    setTeamMessage(null);
    try {
      const response = await fetch("/api/business/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: teamEmail, role: teamRole })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not invite team member.");
      setTeam((current) => [payload.member as TeamMember, ...current.filter((member) => member.id !== payload.member.id)]);
      setTeamEmail("");
      setTeamMessage("Team invite saved.");
    } catch (error) {
      setTeamMessage(error instanceof Error ? error.message : "Could not invite team member.");
    }
  }

  async function removeTeamMember(id: string) {
    setTeamMessage(null);
    try {
      const response = await fetch(`/api/business/team?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not remove team member.");
      setTeam((current) => current.filter((member) => member.id !== id));
    } catch (error) {
      setTeamMessage(error instanceof Error ? error.message : "Could not remove team member.");
    }
  }

  async function requestWithdrawal() {
    const amount = Number(withdrawalAmount);
    setWithdrawalMessage(null);
    if (!amount || amount < 2000) {
      setWithdrawalMessage("Enter an amount of at least NGN 2,000.");
      return;
    }
    if (amount > 200000) {
      setWithdrawalMessage("Maximum withdrawal is NGN 200,000 per request.");
      return;
    }
    setWithdrawalLoading(true);
    try {
      const response = await fetch("/api/wallet/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, accountKind: "business" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not request withdrawal.");
      setWithdrawals((current) => [payload.withdrawal as WithdrawalRow, ...current]);
      setWalletBalance((current) => Math.max(0, current - amount));
      setWithdrawalMessage("Business withdrawal request submitted for admin review.");
      setWithdrawalOpen(false);
      setWithdrawalAmount("");
    } catch (error) {
      setWithdrawalMessage(error instanceof Error ? error.message : "Could not request withdrawal.");
    } finally {
      setWithdrawalLoading(false);
    }
  }

  function exportHistory() {
    const csv = ["date,code,pickup,dropoff,status,cost", ...orders.map((order) => `${order.created_at},${order.delivery_code},${order.pickup_address},${order.dropoff_address},${order.status},${order.price_ngn}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "fastfleet-business-history.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="min-h-screen bg-fleet-paper pb-24">
      <div className="mx-auto max-w-7xl">
        <main className="min-w-0 px-4 pb-5 pt-4 sm:px-6 lg:pb-8">
          <BackButton className="mb-4" />
          <header className="mb-5 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-black text-fleet-night sm:text-4xl">{profile.business_name || "Business dashboard"}</h1>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {kycStatus === "active" ? "Dispatch, history, team, wallet, and account controls." : "Business KYC status and review updates."}
                </p>
              </div>
            </div>
            <NotificationBell />
          </header>
          {kycStatus !== "active" ? (
            <BusinessKycStatusView loading={loading} profile={profile} status={kycStatus} rejectionReason={kycRejectionReason} />
          ) : (
            <>
              {activeTab === "overview" ? <OverviewTab loading={loading} profile={profile} walletBalance={walletBalance} withdrawals={withdrawals} stats={stats} orders={orders} businessOrders={businessOrders} businessOrderError={businessOrderError} businessOrderLoading={businessOrderLoading} onOpenWithdrawal={() => setWithdrawalOpen(true)} onBusinessOrderStatus={updateBusinessOrder} /> : null}
              {activeTab === "dispatch" ? <DispatchTab dispatch={dispatch} onDispatch={setDispatch} estimate={estimatePrice(dispatch)} loading={dispatchLoading} message={dispatchMessage} onSubmit={submitDispatch} addresses={addresses} bulkRows={bulkRows} onCsv={parseCsv} onDownloadTemplate={downloadTemplate} onDispatchBulk={dispatchBulk} addressDraft={addressDraft} onAddressDraft={setAddressDraft} onAddAddress={addAddress} onDeleteAddress={deleteAddress} /> : null}
              {activeTab === "history" ? <HistoryTab orders={filteredOrders} status={historyStatus} onStatus={setHistoryStatus} onExport={exportHistory} /> : null}
              {activeTab === "analytics" ? <AnalyticsTab orders={orders} addresses={addresses} team={team} /> : null}
              {activeTab === "account" ? <AccountTab profile={profile} onProfile={setProfile} prefs={prefs} onPrefs={setPrefs} /> : null}
            </>
          )}
        </main>
      </div>
      <BusinessMobileTabs activeTab={activeTab} onChange={setActiveTab} disabled={kycStatus !== "active"} />
      {withdrawalOpen ? <BusinessWithdrawalModal amount={withdrawalAmount} onAmount={setWithdrawalAmount} profile={profile} loading={withdrawalLoading} message={withdrawalMessage} onClose={() => setWithdrawalOpen(false)} onSubmit={requestWithdrawal} /> : null}
      <ReviewPrompt subject={reviewSubject} />
    </section>
  );
}

function BusinessMobileTabs({ activeTab, onChange, disabled = false }: { activeTab: BusinessTab; onChange: (tab: BusinessTab) => void; disabled?: boolean }) {
  const renderTab = (tab: (typeof tabs)[number]) => {
    const Icon = tab.icon;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => {
          if (!disabled) onChange(tab.id);
        }}
        disabled={disabled}
        className={cn(
          "grid min-h-14 place-items-center rounded-[18px] px-1 py-2 text-[0.62rem] font-black leading-none transition",
          activeTab === tab.id && !disabled ? "bg-sky-50 text-fleet-blue ring-1 ring-sky-100" : "text-slate-500 hover:bg-fleet-paper",
          disabled && "cursor-not-allowed opacity-45 hover:bg-transparent"
        )}
      >
        <Icon className="mb-1 h-4 w-4" />
        <span className="max-w-full truncate">{tab.label}</span>
      </button>
    );
  };

  return (
    <nav className="fixed inset-x-3 bottom-3 z-50 mx-auto grid max-w-3xl grid-cols-7 gap-1 rounded-[24px] border border-fleet-line bg-white/95 p-2 shadow-glow backdrop-blur" aria-label="Business dashboard navigation">
      <Link href="/hub" className="grid min-h-14 place-items-center rounded-[18px] px-1 py-2 text-[0.62rem] font-black leading-none text-slate-500 transition hover:bg-fleet-paper">
        <LayoutDashboard className="mb-1 h-4 w-4" />
        <span className="max-w-full truncate">Hub</span>
      </Link>
      {tabs.slice(0, 2).map(renderTab)}
      <Link href="/marketplace/listing" className="grid min-h-14 place-items-center rounded-[18px] px-1 py-2 text-[0.62rem] font-black leading-none text-slate-500 transition hover:bg-fleet-paper">
        <Store className="mb-1 h-4 w-4" />
        <span className="max-w-full truncate">Shopping Listing</span>
      </Link>
      {tabs.slice(2).map(renderTab)}
    </nav>
  );
}

function BusinessKycStatusView({ loading, profile, status, rejectionReason }: { loading: boolean; profile: BusinessProfile; status: BusinessKycStatus; rejectionReason: string | null }) {
  if (loading) return <DashboardSkeleton />;
  const rejected = status === "rejected";
  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Business KYC</span>
            <h2 className="mt-2 text-3xl font-black text-fleet-night">{rejected ? "KYC rejected" : "KYC pending review"}</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              {rejected
                ? "Fast Fleets 360 admin reviewed your business profile and needs you to correct the details below before resubmitting."
                : "Your business profile has been submitted. Dispatch tools unlock after Fast Fleets 360 admin approves your KYC."}
            </p>
          </div>
          <StatusBadge tone={rejected ? "red" : "amber"}>{status.replaceAll("_", " ")}</StatusBadge>
        </div>
        {rejected ? (
          <div className="mt-5 rounded-fleet border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-700">
            {rejectionReason || "No reason was provided. Please contact support or update your business details."}
          </div>
        ) : null}
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="KYC status" value={rejected ? "Rejected" : "Pending"} />
        <Stat label="Business" value={profile.business_name || "Submitted"} />
        <Stat label="Pickup" value={profile.pickup_address ? "Added" : "Missing"} />
      </div>
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-navy text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-xl font-black text-fleet-night">What happens next</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Admin can approve or reject the business from the admin backpage. Once approved, this same dashboard opens dispatch, team, analytics, wallet, and history controls.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {rejected ? <LinkButton href="/business/register" variant="secondary">Update KYC</LinkButton> : null}
              <LinkButton href="/support?topic=business" variant="secondary">Contact support</LinkButton>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function OverviewTab({ loading, profile, walletBalance, withdrawals, stats, orders, businessOrders, businessOrderError, businessOrderLoading, onOpenWithdrawal, onBusinessOrderStatus }: { loading: boolean; profile: BusinessProfile; walletBalance: number; withdrawals: WithdrawalRow[]; stats: { today: number; monthSpend: number; active: number; addresses: number }; orders: DeliveryRow[]; businessOrders: BusinessOrderRow[]; businessOrderError: string | null; businessOrderLoading: string | null; onOpenWithdrawal: () => void; onBusinessOrderStatus: (id: string, status: string) => void }) {
  if (loading) return <DashboardSkeleton />;
  const activeOrder = orders.find((order) => !["delivered", "cancelled"].includes(order.status)) || orders[0] || null;
  return (
    <div className="grid gap-5">
      <Card className="p-5"><div className="flex items-center gap-4"><ProfileImage src={profile.avatar_url} name={profile.business_name || "Business"} className="h-16 w-16 rounded-fleet text-lg" /><div><h2 className="text-xl font-black text-fleet-night">{profile.business_name || "Business"}</h2><p className="text-sm font-semibold text-slate-500">Profile picture and business name editable in Account</p></div></div></Card>
      <WalletDashboardCard
        userName={profile.business_name?.trim().split(/\s+/)[0] || "Business"}
        balance={walletBalance}
        walletType="customer"
        accountKind="business"
        kycStatus={profile.registration_status === "active" ? "verified" : profile.registration_status === "rejected" ? "more_info_needed" : "pending"}
        returnTo="/business/dashboard"
        onWithdraw={onOpenWithdrawal}
        transactionHref="/business/dashboard#transactions"
      />
      <TransactionHistory accountKind="business" compact />
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Business withdrawal history</h2>
        <div className="mt-4 grid gap-3">
          {withdrawals.length ? withdrawals.slice(0, 5).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3">
              <span>
                <strong className="block text-sm font-black text-fleet-night">{formatMoney(item.amount_ngn)}</strong>
                <span className="text-xs font-semibold text-slate-500">{formatDateTime(item.created_at)}</span>
              </span>
              <StatusBadge tone={item.status === "paid" || item.status === "approved" ? "green" : item.status === "rejected" ? "red" : "amber"}>{item.status}</StatusBadge>
            </div>
          )) : <DashboardEmptyState title="No business withdrawals" body="Approved business wallet withdrawals will appear here." ctaLabel="Withdraw" ctaHref="/business/dashboard" />}
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Orders today" value={String(stats.today)} /><Stat label="Spent this month" value={formatMoney(stats.monthSpend)} /><Stat label="Active" value={String(stats.active)} /><Stat label="Saved addresses" value={String(stats.addresses)} /></div>
      <BusinessOrdersPanel orders={businessOrders} error={businessOrderError} busyAction={businessOrderLoading} onStatus={onBusinessOrderStatus} />
      <Card className="overflow-hidden p-0">
        <RoutePreview
          compact
          className="rounded-none border-0"
          label="Business live map"
          status={activeOrder?.status}
          riderName="Assigned courier"
          pickupAddress={activeOrder?.pickup_address || profile.pickup_address || "Victoria Island, Lagos"}
          dropoffAddress={activeOrder?.dropoff_address || "Ikeja GRA, Lagos"}
        />
      </Card>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Recent orders</h2><div className="mt-4 grid gap-3">{orders.slice(0, 5).map((order) => <OrderCard key={order.id} order={order} />)}</div></Card>
    </div>
  );
}

function BusinessOrdersPanel({ orders, error, busyAction, onStatus }: { orders: BusinessOrderRow[]; error: string | null; busyAction: string | null; onStatus: (id: string, status: string) => void }) {
  const statuses = [
    ["received", "Order Received"],
    ["preparing", "Preparing Order"],
    ["packing", "Packing Order"],
    ["ready_for_pickup", "Ready for Pickup"]
  ] as const;

  return (
    <Card id="marketplace-orders" className="p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-black text-fleet-night">Marketplace orders</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">New linked restaurant, mall, and product orders for this business.</p>
        </div>
        <StatusBadge tone={orders.length ? "amber" : "neutral"}>{orders.length} orders</StatusBadge>
      </div>
      {error ? <div className="mt-4 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">{error}</div> : null}
      <div className="mt-4 grid gap-3">
        {orders.length ? (
          orders.slice(0, 6).map((order) => (
            <article key={order.id} className="rounded-fleet border border-fleet-line bg-white p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <strong className="block text-sm font-black text-fleet-night">{order.order_code || order.id}</strong>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    {businessOrderItemsLabel(order)} · {order.dropoff_address}
                  </span>
                  <span className="mt-1 block text-xs font-bold text-slate-500">
                    {formatMoney(Number(order.amount || 0))} · {businessOrderVehicleLabel(order)}
                  </span>
                </div>
                <StatusBadge tone={businessOrderTone(order.status)}>{businessOrderLabel(order.status)}</StatusBadge>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                {statuses.map(([status, label]) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={order.status === status ? "primary" : "secondary"}
                    disabled={!order.id || isBusinessOrderStatusLocked(order.status, status) || busyAction === `${order.id}:${status}`}
                    onClick={() => onStatus(order.id, status)}
                  >
                    {busyAction === `${order.id}:${status}` ? "Updating..." : label}
                  </Button>
                ))}
              </div>
              {isBusinessDispatchActive(order.status) ? <BusinessOrderObserver order={order} /> : null}
            </article>
          ))
        ) : (
          <DashboardEmptyState title="No marketplace orders" body="Linked marketplace orders will appear here in realtime." ctaLabel="Manage listings" ctaHref="/admin" />
        )}
      </div>
    </Card>
  );
}

function BusinessOrderObserver({ order }: { order: BusinessOrderRow }) {
  return (
    <div className="mt-4 rounded-[20px] border border-fleet-line bg-[#f7fafc] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Marketplace dispatch room</span>
          <h3 className="mt-1 text-sm font-black text-fleet-night">{businessOrderLabel(order.status)}</h3>
        </div>
        <StatusBadge tone={businessOrderTone(order.status)}>Observer</StatusBadge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[16px] bg-white p-3 text-sm font-bold leading-5 text-slate-600">
          <span className="block text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">Customer handoff</span>
          {order.dropoff_address || "Customer delivery address"}
        </div>
        <div className="rounded-[16px] bg-white p-3 text-sm font-bold leading-5 text-slate-600">
          <span className="block text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">Business role</span>
          Monitor pickup, transit, and delivery. FastConfirm™ decisions stay with the receiver.
        </div>
      </div>
    </div>
  );
}

function isBusinessDispatchActive(status: string) {
  return ["rider_assigned", "picked_up", "in_transit"].includes(status);
}

function DispatchTab({ dispatch, onDispatch, estimate, loading, message, onSubmit, addresses, bulkRows, onCsv, onDownloadTemplate, onDispatchBulk, addressDraft, onAddressDraft, onAddAddress, onDeleteAddress }: { dispatch: DispatchForm; onDispatch: (form: DispatchForm) => void; estimate: number; loading: boolean; message: string | null; onSubmit: () => void; addresses: SavedAddress[]; bulkRows: BulkRow[]; onCsv: (text: string) => void; onDownloadTemplate: () => void; onDispatchBulk: () => void; addressDraft: { label: string; address: string }; onAddressDraft: (draft: { label: string; address: string }) => void; onAddAddress: () => void; onDeleteAddress: (id: string) => void }) {
  return (
    <div className="grid gap-5">
        <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Single dispatch</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Sender name" value={dispatch.senderName} onChange={(value) => onDispatch({ ...dispatch, senderName: value })} /><Field label="Sender phone" value={dispatch.senderPhone} onChange={(value) => onDispatch({ ...dispatch, senderPhone: value })} /><AddressField label="Pickup address" value={dispatch.pickupAddress} addresses={addresses} onChange={(value) => onDispatch({ ...dispatch, pickupAddress: value })} /><Field label="Recipient name" value={dispatch.recipientName} onChange={(value) => onDispatch({ ...dispatch, recipientName: value })} /><Field label="Recipient phone" value={dispatch.recipientPhone} onChange={(value) => onDispatch({ ...dispatch, recipientPhone: value })} /><AddressField label="Drop-off address" value={dispatch.dropoffAddress} addresses={addresses} onChange={(value) => onDispatch({ ...dispatch, dropoffAddress: value })} /><Select label="Package type" value={dispatch.packageType} values={["Parcel", "Documents", "Food", "Electronics", "Gadgets"]} onChange={(value) => onDispatch({ ...dispatch, packageType: value })} /><Select label="Vehicle" value={dispatch.vehicleType} values={["Any", "Bike", "Car", "Van"]} onChange={(value) => onDispatch({ ...dispatch, vehicleType: value })} /><Select label="Scheduling" value={dispatch.scheduleMode} values={["Now", "Schedule for later"]} onChange={(value) => onDispatch({ ...dispatch, scheduleMode: value })} />{dispatch.scheduleMode === "Schedule for later" ? <Field label="Date and time" value={dispatch.scheduledAt} onChange={(value) => onDispatch({ ...dispatch, scheduledAt: value })} /> : null}<Select label="Payment" value={dispatch.payment} values={["wallet"]} onChange={(value) => onDispatch({ ...dispatch, payment: value })} /><label className="form-field sm:col-span-2"><span className="form-label">Special instructions</span><textarea className="form-textarea" value={dispatch.instructions} onChange={(event) => onDispatch({ ...dispatch, instructions: event.target.value })} /></label></div><div className="mt-5 rounded-fleet bg-fleet-paper p-4 text-sm font-black text-fleet-night">Estimated price: {formatMoney(estimate)}</div>{message ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}<Button type="button" disabled={loading} className="mt-5 w-full bg-fleet-navy hover:bg-fleet-night" onClick={onSubmit}>{loading ? "Creating..." : "Confirm dispatch"}</Button></Card>
      <Card className="p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black text-fleet-night">Bulk dispatch</h2><Button type="button" size="sm" variant="secondary" onClick={onDownloadTemplate}><Download className="h-4 w-4" />Template</Button></div><label className="mt-4 grid min-h-32 cursor-pointer place-items-center rounded-fleet border border-dashed border-fleet-line bg-fleet-paper p-5 text-center text-sm font-bold text-slate-600"><Upload className="mb-2 h-6 w-6 text-fleet-navy" />Upload CSV<input className="sr-only" type="file" accept=".csv,text/csv" onChange={async (event) => { const file = event.target.files?.[0]; if (file) onCsv(await file.text()); }} /></label>{bulkRows.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><tbody>{bulkRows.map((row, index) => <tr key={`${row.sender_name}-${index}`} className={row.error ? "bg-red-50" : "bg-white"}><td className="p-2 font-bold">{row.sender_name}</td><td className="p-2">{row.pickup_address}</td><td className="p-2">{row.dropoff_address}</td><td className="p-2 text-red-600">{row.error}</td></tr>)}</tbody></table><Button type="button" disabled={bulkRows.some((row) => row.error)} className="mt-4 w-full" onClick={onDispatchBulk}>Dispatch all</Button></div> : null}</Card>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Saved addresses</h2><div className="mt-4 grid gap-3 sm:grid-cols-[0.7fr_1fr_auto]"><input className="form-input" value={addressDraft.label} onChange={(event) => onAddressDraft({ ...addressDraft, label: event.target.value })} placeholder="Warehouse" /><input className="form-input" value={addressDraft.address} onChange={(event) => onAddressDraft({ ...addressDraft, address: event.target.value })} placeholder="14 Acme Street, Ikeja" /><Button type="button" onClick={onAddAddress} disabled={!addressDraft.label || !addressDraft.address}>Add</Button></div><div className="mt-4 grid gap-2">{addresses.length ? addresses.map((address) => <div key={address.id} className="flex justify-between gap-3 rounded-fleet bg-fleet-paper p-3"><span><strong className="block text-sm font-black text-fleet-night">{address.label}</strong><span className="text-xs font-semibold text-slate-500">{address.address}</span></span><Button type="button" size="sm" variant="secondary" onClick={() => onDeleteAddress(address.id)}>Delete</Button></div>) : <DashboardEmptyState title="No saved addresses" body="Add warehouses, branches, and frequent pickup locations." ctaLabel="Add address" ctaHref="/business/dashboard" />}</div></Card>
    </div>
  );
}

function HistoryTab({ orders, status, onStatus, onExport }: { orders: DeliveryRow[]; status: string; onStatus: (status: string) => void; onExport: () => void }) {
  return <div className="grid gap-4"><div className="flex flex-wrap justify-between gap-2"><div className="flex gap-2">{["all", "pending", "in_transit", "delivered", "cancelled"].map((item) => <button key={item} type="button" onClick={() => onStatus(item)} className={cn("rounded-full px-4 py-2 text-sm font-black capitalize", status === item ? "bg-fleet-navy text-white" : "bg-white text-slate-600")}>{item}</button>)}</div><Button type="button" variant="secondary" onClick={onExport}>Export CSV</Button></div>{orders.length ? orders.map((order) => <OrderCard key={order.id} order={order} detail />) : <DashboardEmptyState title="No orders found" body="Change filters or create a dispatch." ctaLabel="New dispatch" ctaHref="/business/dashboard" />}</div>;
}

function TeamTab({ team, email, role, message, onEmail, onRole, onInvite, onRemove }: { team: TeamMember[]; email: string; role: "dispatcher" | "viewer"; message: string | null; onEmail: (email: string) => void; onRole: (role: "dispatcher" | "viewer") => void; onInvite: () => void; onRemove: (id: string) => void }) {
  return <div className="grid gap-5"><Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Invite team member</h2><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]"><input className="form-input" value={email} onChange={(event) => onEmail(event.target.value)} placeholder="dispatcher@example.com" /><select className="form-input" value={role} onChange={(event) => onRole(event.target.value as "dispatcher" | "viewer")}><option value="dispatcher">Dispatcher</option><option value="viewer">Viewer</option></select><Button type="button" disabled={!email.includes("@")} onClick={onInvite}>Invite</Button></div>{message ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}</Card><Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Team members</h2><div className="mt-4 grid gap-3">{team.length ? team.map((member) => <div key={member.id} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3"><span><strong className="block text-sm font-black text-fleet-night">{member.email}</strong><span className="mt-2 flex gap-2"><StatusBadge tone="blue">{member.role}</StatusBadge>{member.status ? <StatusBadge tone="amber">{member.status}</StatusBadge> : null}</span></span><Button type="button" size="sm" variant="secondary" onClick={() => onRemove(member.id)}>Remove</Button></div>) : <DashboardEmptyState title="No team members" body="Invite dispatchers or viewers to collaborate." ctaLabel="Invite member" ctaHref="/business/dashboard" />}</div></Card></div>;
}

function AnalyticsTab({ orders, addresses, team }: { orders: DeliveryRow[]; addresses: SavedAddress[]; team: TeamMember[] }) {
  const delivered = orders.filter((order) => order.status === "delivered");
  const active = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  const cancelled = orders.filter((order) => order.status === "cancelled");
  const totalSpend = orders.reduce((sum, order) => sum + Number(order.price_ngn || 0), 0);
  const averageCost = orders.length ? totalSpend / orders.length : 0;
  const maxSpend = Math.max(...orders.map((order) => Number(order.price_ngn || 0)), 1);
  const topRoutes = orders.slice(0, 5);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total spend" value={formatMoney(totalSpend)} />
        <Stat label="Avg. delivery" value={formatMoney(averageCost)} />
        <Stat label="Success rate" value={orders.length ? `${Math.round((delivered.length / orders.length) * 100)}%` : "0%"} />
        <Stat label="Team seats" value={String(team.length)} />
      </div>
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Dispatch performance</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <StatusMetric label="Active" value={active.length} tone="blue" />
          <StatusMetric label="Delivered" value={delivered.length} tone="green" />
          <StatusMetric label="Cancelled" value={cancelled.length} tone="red" />
        </div>
        <div className="mt-6 flex h-44 items-end gap-2">
          {(orders.length ? orders.slice(0, 12) : [{ id: "empty", price_ngn: 0 } as DeliveryRow]).map((order, index) => (
            <span key={`${order.id}-${index}`} className="flex-1 rounded-t bg-fleet-navy" style={{ height: `${Math.max(12, (Number(order.price_ngn || 0) / maxSpend) * 100)}%` }} title={formatMoney(order.price_ngn || 0)} />
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Route intelligence</h2>
        <div className="mt-4 grid gap-3">
          {topRoutes.length ? topRoutes.map((order) => <div key={order.id} className="rounded-fleet bg-fleet-paper p-3"><strong className="block text-sm font-black text-fleet-night">{order.pickup_address} to {order.dropoff_address}</strong><span className="mt-1 block text-xs font-semibold text-slate-500">{formatMoney(order.price_ngn)} · {order.status.replaceAll("_", " ")}</span></div>) : <DashboardEmptyState title="No route data yet" body="Create dispatches to see frequent routes, spend, and delivery outcomes." ctaLabel="New dispatch" ctaHref="/business/dashboard" />}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Saved address coverage</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">{addresses.length ? `${addresses.length} saved pickup or drop-off locations are available for repeat dispatches.` : "Add warehouses, branches, and frequent customer locations to speed up future dispatches."}</p>
      </Card>
    </div>
  );
}

function StatusMetric({ label, value, tone }: { label: string; value: number; tone: "blue" | "green" | "red" }) {
  const color = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "red" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700";
  return <div className={cn("rounded-fleet p-4", color)}><span className="text-xs font-black uppercase tracking-[0.12em]">{label}</span><strong className="mt-2 block text-3xl font-black">{value}</strong></div>;
}

function BusinessWithdrawalModal({ amount, onAmount, profile, loading, message, onClose, onSubmit }: { amount: string; onAmount: (value: string) => void; profile: BusinessProfile; loading: boolean; message: string | null; onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-end bg-fleet-night/35 p-3 sm:place-items-center">
      <Card className="w-full max-w-md p-5">
        <h2 className="text-2xl font-black text-fleet-night">Request withdrawal</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">Business wallet · {profile.business_name || "Business account"} · KYC approved</p>
        <p className="mt-2 text-xs font-bold leading-5 text-slate-500">Minimum NGN 2,000. Maximum NGN 200,000 per request. Approved payouts are credited within 10 business hours.</p>
        <label className="form-field mt-5"><span className="form-label">Amount</span><input className="form-input" value={amount} onChange={(event) => onAmount(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="5000" /></label>
        {message ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" disabled={loading || !amount} onClick={onSubmit}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Submit</Button></div>
      </Card>
    </div>
  );
}

function AccountTab({ profile, onProfile, prefs, onPrefs }: { profile: BusinessProfile; onProfile: (profile: BusinessProfile) => void; prefs: { email: boolean; sms: boolean; wallet: boolean }; onPrefs: (prefs: { email: boolean; sms: boolean; wallet: boolean }) => void }) {
  const [photoLoading, setPhotoLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(profile.avatar_url ? null : "Upload a business profile picture for your account.");
  const selectedState = normalizeState(profile.operating_state || profile.default_zone);
  const missingState = !selectedState;

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

  async function saveProfile() {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const response = await fetch("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: profile.business_name,
          pickup_address: profile.pickup_address,
          state: profile.operating_state || profile.default_zone,
          cac_number: profile.cac_number,
          business_type: profile.business_type === "Shopping" ? "Mall" : profile.business_type || profile.industry,
          contact_name: profile.contact_name,
          phone: profile.phone,
          email: profile.email
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { profile?: BusinessProfile; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save business profile.");
      const savedState = normalizeState(payload.profile?.operating_state || payload.profile?.default_zone || profile.operating_state || profile.default_zone);
      onProfile({ ...profile, ...(payload.profile || {}), operating_state: savedState, default_zone: savedState });
      setProfileMessage("Business profile saved.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Could not save business profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      {missingState ? (
        <Card className="border-amber-200 bg-amber-50 p-5">
          <h2 className="text-xl font-black text-amber-900">Select your business state</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-amber-800">
            Add the state where this business operates, then save your profile. This helps riders in the correct state receive your ready-for-pickup orders.
          </p>
        </Card>
      ) : null}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <ProfileImage src={profile.avatar_url} name={profile.business_name || "Business"} className="h-16 w-16 rounded-fleet text-lg" />
          <div>
            <h2 className="text-xl font-black text-fleet-night">{profile.business_name || "Business"}</h2>
            <p className="text-sm font-semibold text-slate-500">
              {marketplaceBusinessTypeLabel(profile.business_type || profile.industry) || "Business type not set"} · Commission {Number(profile.commission_rate || 0).toFixed(0)}%
            </p>
            <label className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-fleet border border-white/70 bg-white/90 px-3 py-2 text-xs font-black text-fleet-night shadow-[0_10px_26px_rgba(8,17,31,0.08)]">
              {photoLoading ? "Uploading..." : profile.avatar_url ? "Change profile picture" : "Upload profile picture"}
              <input className="sr-only" type="file" accept="image/*" onChange={(event) => handleProfilePhoto(event.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
        {photoMessage ? <div className="mt-4 rounded-fleet bg-fleet-paper p-3 text-xs font-bold leading-5 text-slate-600">{photoMessage}</div> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Business name" value={profile.business_name || ""} onChange={(value) => onProfile({ ...profile, business_name: value })} />
          <label className="form-field">
            <span className="form-label">Business state</span>
            <select className="form-input" value={selectedState} onChange={(event) => onProfile({ ...profile, operating_state: event.target.value, default_zone: event.target.value })}>
              <option value="">Select state</option>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </label>
          <Field label="Address" value={profile.pickup_address || ""} onChange={(value) => onProfile({ ...profile, pickup_address: value })} />
          <Field label="CAC number" value={profile.cac_number || ""} onChange={(value) => onProfile({ ...profile, cac_number: value })} />
          <Field label="Business type" value={marketplaceBusinessTypeLabel(profile.business_type || profile.industry)} onChange={(value) => onProfile({ ...profile, business_type: value === "Shopping" ? "Mall" : value, industry: value === "Shopping" ? "Mall" : value })} />
          <Field label="Contact person" value={profile.contact_name || ""} onChange={(value) => onProfile({ ...profile, contact_name: value })} />
          <Field label="Contact phone" value={profile.phone || ""} onChange={(value) => onProfile({ ...profile, phone: value })} />
          <Field label="Contact email" value={profile.email || ""} onChange={(value) => onProfile({ ...profile, email: value })} />
        </div>
        {profileMessage ? <div className="mt-4 rounded-fleet bg-fleet-paper p-3 text-sm font-bold text-slate-600">{profileMessage}</div> : null}
        <Button type="button" className="mt-5 w-full" onClick={saveProfile} disabled={profileSaving || missingState}>
          {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save profile
        </Button>
      </Card>
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Notification preferences</h2>
        <div className="mt-4 grid gap-3">
          {(["email", "sms", "wallet"] as const).map((key) => (
            <label key={key} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3 text-sm font-black capitalize text-fleet-night">
              {key}
              <input type="checkbox" className="h-5 w-5 accent-fleet-navy" checked={prefs[key]} onChange={(event) => onPrefs({ ...prefs, [key]: event.target.checked })} />
            </label>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <AccountDeletionButton />
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full"
          onClick={async () => {
            const supabase = createClient();
            await supabase.auth.signOut();
            window.location.assign("/auth");
          }}
        >
          Sign out
        </Button>
      </Card>
    </div>
  );
}

function ProfileImage({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  if (src) return <Image src={src} alt="" width={96} height={96} unoptimized className={cn("shrink-0 object-cover", className)} />;
  return <span className={cn("grid shrink-0 place-items-center bg-fleet-navy font-black text-white", className)}>{initials(name)}</span>;
}

function OrderCard({ order, detail }: { order: DeliveryRow; detail?: boolean }) {
  return <article className="rounded-fleet border border-fleet-line bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-500">{formatDateTime(order.created_at)}</p><h3 className="mt-1 text-sm font-black text-fleet-night">{order.delivery_code}</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{order.pickup_address} to {order.dropoff_address}</p></div><StatusBadge tone={order.status === "delivered" ? "green" : "amber"}>{order.status.replaceAll("_", " ")}</StatusBadge></div><div className="mt-3 flex items-center justify-between"><strong className="text-sm font-black text-fleet-night">{formatMoney(order.price_ngn)}</strong><LinkButton href={accountTrackingHref(order.delivery_code)} size="sm" variant="secondary">{detail ? "View details" : "Track"}</LinkButton></div>{detail ? <div className="mt-3 rounded-fleet bg-fleet-paper p-3 text-xs font-bold text-slate-500">Timeline: Booked to Rider assigned to Picked up to Delivered. Proof of delivery appears here when uploaded.</div> : null}</article>;
}

function businessOrderLabel(status: string) {
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

function businessOrderTone(status: string): "green" | "amber" | "red" | "blue" | "neutral" {
  if (status === "delivered") return "green";
  if (status === "cancelled") return "red";
  if (["rider_assigned", "picked_up", "in_transit"].includes(status)) return "blue";
  if (["received", "preparing", "packing", "ready_for_pickup"].includes(status)) return "amber";
  return "neutral";
}

function isBusinessOrderStatusLocked(current: string, target: string) {
  const order = ["received", "preparing", "packing", "ready_for_pickup"];
  if (["rider_assigned", "picked_up", "in_transit", "delivered", "cancelled"].includes(current)) return true;
  return order.indexOf(target) < order.indexOf(current);
}

function businessOrderItemsLabel(order: BusinessOrderRow) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return order.package_type;
  return items
    .slice(0, 2)
    .map((item) => `${Number(item.quantity || 1)}x ${item.name || item.productName || "Item"}`)
    .join(", ");
}

function businessOrderVehicleLabel(order: BusinessOrderRow) {
  const vehicle = String(order.vehicle_type || "").toLowerCase();
  if (vehicle === "bike") return String(order.vehicle_subtype || "").toLowerCase() === "bicycle" ? "Bicycle" : "Motorcycle";
  if (vehicle === "car") return "Car";
  if (vehicle === "van") return "Van";
  return order.vehicle_type || "Vehicle pending";
}

function AddressField({ label, value, addresses, onChange }: { label: string; value: string; addresses: SavedAddress[]; onChange: (value: string) => void }) {
  return <label className="form-field"><span className="form-label">{label}</span><input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Search or type address" />{addresses.length ? <select className="form-input" value="" onChange={(event) => event.target.value && onChange(event.target.value)}><option value="">Choose saved address</option>{addresses.map((address) => <option key={address.id} value={address.address}>{address.label} - {address.address}</option>)}</select> : null}</label>;
}

function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="form-field"><span className="form-label">{label}</span><select className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>{values.map((item) => <option key={item}>{item}</option>)}</select></label>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="form-field"><span className="form-label">{label}</span><input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card className="p-3"><p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><strong className="mt-2 block text-lg font-black text-fleet-night">{value}</strong></Card>;
}

function DashboardSkeleton() {
  return <div className="grid gap-4"><Skeleton className="h-36" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-64" /></div>;
}
