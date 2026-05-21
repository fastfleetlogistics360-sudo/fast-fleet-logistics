"use client";

import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import {
  ArrowDownToLine,
  Bell,
  Bike,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck2,
  Flag,
  Gauge,
  Headphones,
  History,
  Home,
  Loader2,
  MapPin,
  PlayCircle,
  RefreshCw,
  Star,
  ToggleLeft,
  ToggleRight,
  UserRound,
  Wallet,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { isLaunchState, launchStateLabel, localLiveStates, normalizeState } from "@/lib/launch-states";
import { sampleRiders } from "@/lib/dispatch";
import { Card } from "@/components/ui/card";
import { LinkButton, Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { RoutePreview } from "@/components/maps/route-preview";
import { JoinStateWaitlistButton } from "@/components/waitlist/join-state-waitlist-button";

type DeliveryJob = {
  id?: string;
  delivery_code: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
  status: string;
  price_ngn: number;
  distance_km: number;
  eta_minutes: number;
  created_at?: string;
};

const demoJobs: DeliveryJob[] = [
  {
    delivery_code: "FF-REQ-901",
    pickup_address: "Lekki Phase 1",
    dropoff_address: "Victoria Island",
    vehicle_type: "bike",
    status: "searching",
    price_ngn: 3850,
    distance_km: 5.8,
    eta_minutes: 24
  },
  {
    delivery_code: "FF-REQ-902",
    pickup_address: "Ikoyi",
    dropoff_address: "Yaba",
    vehicle_type: "bike",
    status: "searching",
    price_ngn: 5200,
    distance_km: 9.2,
    eta_minutes: 41
  }
];

const transactions = [
  ["Delivery earning", "FF-240911", 3850],
  ["Withdrawal pending", "Kuda Bank", -12000],
  ["Bonus", "Gold streak", 2500]
];

const highlights: Array<[string, string, LucideIcon]> = [
  ["Completed deliveries", "182", CheckCircle2],
  ["Rider level", "Gold", Star],
  ["Performance", "Excellent", Gauge],
  ["Notifications", "8 unread", Bell]
];

const needsKycActionStatuses = new Set(["not_started", "draft", "more_info_required", "rejected"]);
const reviewKycStatuses = new Set(["submitted", "under_review", "pending", "pending_approval"]);

const driverMenuSections: Array<{
  title: string;
  items: Array<[string, string, LucideIcon, string | null]>;
}> = [
  {
    title: "Active work",
    items: [
      ["Overview", "Status, today's jobs, earnings snapshot", Home, "Home"],
      ["Job requests", "Accept or decline incoming deliveries", Bell, "Live"],
      ["Active delivery", "Live map, route, recipient details", MapPin, "Live"],
      ["Update status", "Picked up to in transit to delivered", RefreshCw, null]
    ]
  },
  {
    title: "History & earnings",
    items: [
      ["Earnings", "Daily, weekly, monthly income", Gauge, null],
      ["Delivery history", "Completed jobs and receipts", History, null],
      ["Withdrawals", "Cash out to your bank account", Wallet, null]
    ]
  },
  {
    title: "Profile & settings",
    items: [
      ["My profile", "Name, vehicle, coverage area", UserRound, null],
      ["KYC status", "Verification and document review", FileCheck2, "Pending"],
      ["Availability", "Go online / go offline toggle", Clock, null],
      ["Support", "Report issues, get help", Headphones, null]
    ]
  }
];

type WalletTransaction = {
  id?: string;
  transaction_type: string;
  amount_ngn: number;
  status: string;
  provider?: string | null;
  provider_reference?: string | null;
  created_at?: string;
};

type WithdrawalRequest = {
  id: string;
  amount_ngn: number;
  bank_name: string;
  account_number: string;
  account_name: string | null;
  status: "pending" | "approved" | "rejected" | "paid";
  rejection_reason: string | null;
  created_at: string;
  reviewed_at?: string | null;
};

export function RiderDashboard() {
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [tripStatus, setTripStatus] = useState("accepted");
  const [availableJobs, setAvailableJobs] = useState<DeliveryJob[]>(demoJobs);
  const [profile, setProfile] = useState<{ email?: string | null; phone?: string | null; default_zone?: string | null }>({ default_zone: "Lagos" });
  const [riderProfile, setRiderProfile] = useState<{
    id: string | null;
    application_status: string;
    bank_name?: string | null;
    account_number?: string | null;
    account_name?: string | null;
  }>({ id: null, application_status: "submitted" });
  const [walletBalance, setWalletBalance] = useState(145800);
  const [lockedBalance, setLockedBalance] = useState(0);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [showWalletBalance, setShowWalletBalance] = useState(true);
  const [topUpAmount, setTopUpAmount] = useState("10000");
  const [walletTopUpLoading, setWalletTopUpLoading] = useState(false);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [withdrawalAmount, setWithdrawalAmount] = useState("3000");
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [withdrawalMessage, setWithdrawalMessage] = useState<string | null>(null);
  const [liveStates, setLiveStates] = useState<string[]>(localLiveStates());
  const [showKycPrompt, setShowKycPrompt] = useState(false);
  const currentRider = sampleRiders()[0];
  const activeTrip = availableJobs.find((job) => ["accepted", "rider_arrived", "picked_up", "in_transit"].includes(job.status));
  const selectedState = normalizeState(profile.default_zone) || "Lagos";
  const kycApproved = riderProfile.application_status === "approved";
  const kycNeedsAction = !riderProfile.id || needsKycActionStatuses.has(riderProfile.application_status);
  const kycUnderReview = !kycApproved && !kycNeedsAction && reviewKycStatuses.has(riderProfile.application_status);
  const kycStatusLabel = kycApproved ? "KYC approved" : kycUnderReview ? "Under review" : "Action required";
  const withdrawnLast24Hours = withdrawalRequests
    .filter((request) => new Date(request.created_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
    .filter((request) => request.status !== "rejected")
    .reduce((sum, request) => sum + Number(request.amount_ngn || 0), 0);
  const metrics = useMemo(
    () => [
      ["Today earnings", formatMoney(28600), "6 completed deliveries"],
      ["Wallet balance", formatMoney(walletBalance), "Available for withdrawal"],
      ["Rating", currentRider.rating.toFixed(2), "Gold level rider"],
      ["Acceptance", `${currentRider.acceptanceRate}%`, "High dispatch priority"]
    ],
    [currentRider.acceptanceRate, currentRider.rating, walletBalance]
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) return;
        await supabase.from("rider_profiles").update({ online }).eq("user_id", data.user.id);
        const riderResult = await supabase
          .from("rider_profiles")
          .select("id, application_status, bank_name, account_number, account_name")
          .eq("user_id", data.user.id)
          .maybeSingle();
        setRiderProfile({
          id: riderResult.data?.id || null,
          application_status: riderResult.data?.application_status || "submitted",
          bank_name: riderResult.data?.bank_name,
          account_number: riderResult.data?.account_number,
          account_name: riderResult.data?.account_name
        });
        const profileResult = await supabase.from("users").select("email, phone, default_zone").eq("id", data.user.id).maybeSingle();
        setProfile(profileResult.data || { email: data.user.email, phone: data.user.phone, default_zone: "Lagos" });
        const launchResult = await supabase.from("platform_launch_states").select("state, status").eq("status", "live");
        if (launchResult.data?.length) setLiveStates(Array.from(new Set([...localLiveStates(), ...launchResult.data.map((row) => row.state)])));
        const walletResult = await supabase
          .from("wallets")
          .select("id, balance_ngn, locked_balance_ngn")
          .eq("user_id", data.user.id)
          .eq("wallet_type", "rider")
          .maybeSingle();
        if (walletResult.data) {
          setWalletBalance(Number(walletResult.data.balance_ngn || 0));
          setLockedBalance(Number(walletResult.data.locked_balance_ngn || 0));
          const transactionResult = await supabase
            .from("transactions")
            .select("id, transaction_type, amount_ngn, status, provider, provider_reference, created_at")
            .eq("wallet_id", walletResult.data.id)
            .order("created_at", { ascending: false })
            .limit(12);
          setWalletTransactions(transactionResult.data || []);
        }
        if (riderResult.data?.id) {
          if (online && riderResult.data.application_status === "approved") {
            await supabase.rpc("assign_next_delivery_to_rider", { target_rider_profile_id: riderResult.data.id });
          }
          await refreshJobs(riderResult.data.id);
          const withdrawalResult = await supabase
            .from("withdrawal_requests")
            .select("id, amount_ngn, bank_name, account_number, account_name, status, rejection_reason, created_at, reviewed_at")
            .eq("rider_profile_id", riderResult.data.id)
            .order("created_at", { ascending: false })
            .limit(8);
          setWithdrawalRequests((withdrawalResult.data || []) as WithdrawalRequest[]);
        }
      });

      const channel = supabase
        .channel("rider-delivery-requests")
        .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, async () => {
          setToast("Delivery queue updated.");
          notifyDriver("FastFleet job update", "A nearby customer request is ready for review.");
          if (online && riderProfile.id) {
            await supabase.rpc("assign_next_delivery_to_rider", { target_rider_profile_id: riderProfile.id });
            await refreshJobs(riderProfile.id);
          }
        })
        .subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    } catch {
      cleanup = undefined;
    }
    return () => cleanup?.();
  }, [online, riderProfile.id]);

  useEffect(() => {
    if (kycNeedsAction) setShowKycPrompt(true);
    if (!kycNeedsAction) setShowKycPrompt(false);
  }, [kycNeedsAction]);

  async function refreshJobs(riderId = riderProfile.id) {
    if (!riderId) return;
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("deliveries")
        .select("id, delivery_code, pickup_address, dropoff_address, vehicle_type, status, price_ngn, distance_km, eta_minutes, created_at")
        .eq("rider_id", riderId)
        .in("status", ["searching", "accepted", "rider_arrived", "picked_up", "in_transit"])
        .order("created_at", { ascending: false })
        .limit(8);
      setAvailableJobs((data || []) as DeliveryJob[]);
      const liveTrip = data?.find((job) => ["accepted", "rider_arrived", "picked_up", "in_transit"].includes(job.status));
      if (liveTrip) setTripStatus(liveTrip.status);
    } catch {
      setAvailableJobs(demoJobs);
    }
  }

  async function toggleAvailability() {
    const nextOnline = !online;
    setOnline(nextOnline);
    setToast(nextOnline ? "You are online. FastFleet is checking nearby customer requests." : "You are offline. New delivery offers are paused.");
    if (nextOnline) requestNotificationAccess();
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: rider } = await supabase.from("rider_profiles").update({ online: nextOnline }).eq("user_id", user.id).select("id").maybeSingle();
      if (nextOnline && rider?.id) {
        await supabase.rpc("assign_next_delivery_to_rider", { target_rider_profile_id: rider.id });
        await refreshJobs(rider.id);
      }
    } catch {
      // Demo mode keeps the toggle responsive without Supabase env vars.
    }
  }

  async function respondToJob(job: DeliveryJob, decision: "accept" | "reject") {
    setToast(decision === "accept" ? "Job accepted. Customer timeline is now green at courier assigned." : "Job rejected. It has returned to the dispatch queue.");
    if (decision === "accept") {
      setAvailableJobs((current) => current.map((item) => (item.delivery_code === job.delivery_code ? { ...item, status: "accepted" } : item)));
      setTripStatus("accepted");
    } else {
      setAvailableJobs((current) => current.filter((item) => item.delivery_code !== job.delivery_code));
    }
    try {
      if (!job.id) return;
      const supabase = createClient();
      if (decision === "accept") {
        await supabase.rpc("accept_delivery_offer", { target_delivery_id: job.id });
      } else {
        await supabase.rpc("reject_delivery_offer", { target_delivery_id: job.id });
      }
      await refreshJobs();
    } catch {
      // Local demo offers are intentionally optimistic.
    }
  }

  function requestNotificationAccess() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Promise.resolve(Notification.requestPermission()).catch(() => undefined);
    }
  }

  function notifyDriver(title: string, body: string) {
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(title, { body, tag: "fastfleet-driver-job" });
  }

  useEffect(() => {
    if (!online || !riderProfile.id || tripStatus === "delivered" || typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          const supabase = createClient();
          await supabase.from("rider_locations").upsert({
            rider_profile_id: riderProfile.id,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            heading: position.coords.heading,
            speed: position.coords.speed,
            zone: profile.default_zone || "Lagos",
            updated_at: new Date().toISOString()
          });
        } catch {
          // Location sharing is optional in demo mode and depends on browser permission.
        }
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [online, profile.default_zone, riderProfile.id, tripStatus]);

  async function topUpWallet() {
    const amount = Number(topUpAmount);
    setWalletMessage(null);
    if (!Number.isFinite(amount) || amount < 500) {
      setWalletMessage("Enter a wallet top-up amount of at least NGN 500.");
      return;
    }

    setWalletTopUpLoading(true);
    try {
      const response = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, walletType: "rider", returnTo: "/rider/dashboard" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not start Paystack wallet funding.");
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      setWalletMessage(error instanceof Error ? error.message : "Could not start Paystack wallet funding.");
    } finally {
      setWalletTopUpLoading(false);
    }
  }

  async function requestWithdrawal() {
    const amount = Number(withdrawalAmount);
    setWithdrawalMessage(null);
    if (!riderProfile.id) {
      setWithdrawalMessage("Complete driver onboarding before requesting a withdrawal.");
      return;
    }
    if (!kycApproved) {
      setWithdrawalMessage("Your KYC must be approved before withdrawals are enabled.");
      return;
    }
    if (amount < 3000 || amount > 200000) {
      setWithdrawalMessage("Withdrawal amount must be between NGN 3,000 and NGN 200,000.");
      return;
    }
    if (withdrawnLast24Hours + amount > 200000) {
      setWithdrawalMessage("Your 24-hour withdrawal limit is NGN 200,000. The limit resets after 24 hours.");
      return;
    }
    if (amount > walletBalance) {
      setWithdrawalMessage("Your available balance is not enough for this withdrawal.");
      return;
    }

    setWithdrawalLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_withdrawal_request", {
        target_rider_profile_id: riderProfile.id,
        next_amount_ngn: amount
      });
      if (error) throw error;
      const request: WithdrawalRequest = {
        id: String(data || `local-${Date.now()}`),
        amount_ngn: amount,
        bank_name: riderProfile.bank_name || "Bank pending",
        account_number: riderProfile.account_number || "Account pending",
        account_name: riderProfile.account_name || null,
        status: "pending",
        rejection_reason: null,
        created_at: new Date().toISOString()
      };
      setWithdrawalRequests((current) => [request, ...current]);
      setLockedBalance((value) => value + amount);
      setWalletBalance((value) => value - amount);
      setWithdrawalMessage("Withdrawal request sent. Admin will approve or reject it before payout within 24 hours.");
    } catch (error) {
      setWithdrawalMessage(error instanceof Error ? error.message : "Could not request withdrawal.");
    } finally {
      setWithdrawalLoading(false);
    }
  }

  async function updateTrip(status: "in_transit" | "delivered") {
    setTripStatus(status);
    setToast(status === "in_transit" ? "Trip started. Customer can now watch the delivery move live." : "Trip ended. Delivery marked as completed.");
    try {
      const supabase = createClient();
      const updatePayload =
        status === "in_transit"
          ? { status, picked_up_at: new Date().toISOString() }
          : { status, delivered_at: new Date().toISOString() };
      const targetCode = activeTrip?.delivery_code || "FF-240911";
      await supabase
        .from("deliveries")
        .update(updatePayload)
        .eq("delivery_code", targetCode);
      setAvailableJobs((current) => current.map((item) => (item.delivery_code === targetCode ? { ...item, status } : item)));
    } catch {
      // Demo mode keeps the local trip controls responsive without Supabase env vars.
    }
  }

  if (!isLaunchState(selectedState, liveStates)) {
    return <RiderComingSoon state={selectedState} profile={profile} liveStates={liveStates} />;
  }

  return (
    <section className="section-wrap py-8 sm:py-12">
      <DriverWalletBankCard
        balance={walletBalance}
        lockedBalance={lockedBalance}
        showBalance={showWalletBalance}
        onToggleBalance={() => setShowWalletBalance((value) => !value)}
        topUpAmount={topUpAmount}
        onTopUpAmountChange={setTopUpAmount}
        onTopUp={topUpWallet}
        topUpLoading={walletTopUpLoading}
        withdrawalAmount={withdrawalAmount}
        onWithdrawalAmountChange={setWithdrawalAmount}
        onWithdraw={requestWithdrawal}
        withdrawalLoading={withdrawalLoading}
        withdrawalDisabled={!kycApproved}
        kycStatusLabel={kycStatusLabel}
        kycApproved={kycApproved}
        withdrawnLast24Hours={withdrawnLast24Hours}
        walletMessage={walletMessage}
        withdrawalMessage={withdrawalMessage}
      />

      <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Rider dashboard</span>
              <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Driver&apos;s Account Dashboard</h1>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
                Manage job requests, earnings, route previews, ratings, withdrawals, and support from one dispatch cockpit.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAvailability}
              className={`flex min-w-[190px] items-center justify-between gap-3 rounded-fleet border px-4 py-3 text-left transition ${
                online ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-fleet-line bg-fleet-paper text-slate-600"
              }`}
            >
              <span>
                <strong className="block text-sm font-black">{online ? "Go offline" : "Go online"}</strong>
                <span className="text-xs font-bold">{online ? "Receiving jobs" : "Paused"}</span>
              </span>
              {online ? <ToggleRight className="h-8 w-8" /> : <ToggleLeft className="h-8 w-8" />}
            </button>
          </div>
          {toast ? <div className="mt-4 rounded-fleet bg-fleet-night p-3 text-sm font-bold text-white">{toast}</div> : null}
        </Card>

        <DriverSmartCards metrics={metrics} highlights={highlights} />
      </div>

      {!kycApproved ? (
        <Card className={`mt-6 p-5 ${kycUnderReview ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-fleet bg-white shadow-lift ${kycUnderReview ? "text-blue-700" : "text-amber-700"}`}>
                <FileCheck2 className="h-5 w-5" />
              </span>
              <div>
                <span className={`text-xs font-black uppercase tracking-[0.16em] ${kycUnderReview ? "text-blue-700" : "text-amber-700"}`}>{kycStatusLabel}</span>
                <h2 className="mt-1 text-xl font-black text-fleet-night">
                  {kycUnderReview ? "Your driver verification is under review." : "Complete driver verification to unlock withdrawals."}
                </h2>
                <p className={`mt-1 text-sm font-bold leading-6 ${kycUnderReview ? "text-blue-800" : "text-amber-800"}`}>
                  {kycUnderReview
                    ? "Operations will approve you or request more information from the admin panel. You will not see the completion pop-up while review is pending."
                    : "Upload identity, vehicle papers, selfie, and bank details. Admin approval activates full driver earnings access."}
                </p>
              </div>
            </div>
            {kycNeedsAction ? (
              <LinkButton href="/rider/onboarding" className="shrink-0">
                Open KYC
              </LinkButton>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Driver menu</span>
            <h2 className="mt-1 text-2xl font-black text-fleet-night">Driver workspace options</h2>
          </div>
          <Bike className="h-5 w-5 text-fleet-ember" />
        </div>
        <div className="-mx-5 mt-5 flex snap-x gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
          {driverMenuSections.map((section) => (
            <div key={section.title} className="w-[min(84vw,360px)] shrink-0 snap-start rounded-fleet border border-fleet-line bg-white shadow-[0_16px_38px_rgba(8,17,31,0.07)] transition hover:-translate-y-1 hover:shadow-lift lg:w-auto">
              <div className="border-b border-fleet-line px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">{section.title}</div>
              <div className="divide-y divide-fleet-line">
                {section.items.map(([title, body, Icon, tag]) => (
                  <div key={title} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fleet bg-fleet-paper text-fleet-ember">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm font-black text-fleet-night">{title}</strong>
                      <span className="block text-xs font-bold leading-5 text-slate-500">{body}</span>
                    </span>
                    {tag ? <StatusBadge tone={tag === "Pending" ? "amber" : tag === "Live" ? "amber" : "green"}>{tag}</StatusBadge> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Available jobs</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">Delivery requests</h2>
            </div>
            <StatusBadge tone="amber">Accept timer</StatusBadge>
          </div>
          <div className="mt-5 grid gap-3">
            {availableJobs.map((job) => {
              const isOffer = job.status === "searching";
              return (
              <article key={job.delivery_code} className="rounded-fleet border border-fleet-line bg-white p-4 shadow-[0_10px_22px_rgba(8,17,31,0.05)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <strong className="block font-black text-fleet-night">{job.delivery_code}</strong>
                    <span className="text-xs font-bold text-slate-500">
                      {job.pickup_address} to {job.dropoff_address}
                    </span>
                  </div>
                  <StatusBadge tone={isOffer ? "amber" : "green"}>{isOffer ? "New offer" : job.status.replaceAll("_", " ")}</StatusBadge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-black text-slate-600">
                  <span className="rounded-fleet bg-fleet-paper px-2 py-2 capitalize">{job.vehicle_type}</span>
                  <span className="rounded-fleet bg-fleet-paper px-2 py-2">{Number(job.distance_km || 0).toFixed(1)} km</span>
                  <span className="rounded-fleet bg-fleet-paper px-2 py-2">{formatMoney(job.price_ngn)}</span>
                </div>
                {isOffer ? (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Button type="button" variant="secondary" onClick={() => respondToJob(job, "reject")}>Reject</Button>
                    <Button type="button" onClick={() => respondToJob(job, "accept")}>Accept</Button>
                  </div>
                ) : null}
              </article>
            );
            })}
            {availableJobs.length === 0 ? (
              <div className="rounded-fleet bg-fleet-paper p-4 text-sm font-bold text-slate-500">
                No nearby job offers yet. Keep the dashboard online to receive the next matching request.
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Route preview</span>
          <h2 className="mt-1 text-2xl font-black text-fleet-night">Next pickup</h2>
          <div className="mt-4">
            <RoutePreview compact label="Rider route" status={tripStatus} riderName="Tunde Adebayo" />
          </div>
          <div className="mt-5 rounded-fleet border border-fleet-line bg-fleet-paper p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Active trip</span>
                <strong className="mt-1 block text-lg font-black text-fleet-night">{activeTrip?.delivery_code || "No active trip"}</strong>
                <span className="text-xs font-bold text-slate-500">{activeTrip ? `${activeTrip.pickup_address} to ${activeTrip.dropoff_address}` : "Accept a job to begin navigation"}</span>
              </div>
              <StatusBadge tone={tripStatus === "delivered" ? "green" : "amber"}>{tripStatus.replaceAll("_", " ")}</StatusBadge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button type="button" variant="secondary" onClick={() => updateTrip("in_transit")} disabled={!activeTrip || tripStatus === "delivered"}>
                <PlayCircle className="h-4 w-4" />
                Start trip
              </Button>
              <Button type="button" onClick={() => updateTrip("delivered")} disabled={!activeTrip || tripStatus === "delivered"}>
                <Flag className="h-4 w-4" />
                End trip
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Withdrawal status</span>
          <div className="mt-4 grid gap-3">
            {withdrawalRequests.length === 0 ? (
              <div className="rounded-fleet bg-fleet-paper p-3 text-sm font-bold text-slate-500">No withdrawal requests yet.</div>
            ) : (
              withdrawalRequests.map((request) => (
                <div key={request.id} className="rounded-fleet border border-fleet-line bg-white p-3">
                  <div className="flex items-center justify-between gap-4">
                    <span>
                      <strong className="block text-sm font-black text-fleet-night">{formatMoney(Number(request.amount_ngn || 0))}</strong>
                      <span className="text-xs font-bold text-slate-500">
                        {request.bank_name} · {request.account_number}
                      </span>
                    </span>
                    <StatusBadge tone={request.status === "approved" || request.status === "paid" ? "green" : request.status === "rejected" ? "red" : "amber"}>
                      {request.status}
                    </StatusBadge>
                  </div>
                  {request.status === "approved" ? (
                    <p className="mt-2 text-xs font-bold leading-5 text-emerald-700">Approved. You will be credited before 24 hours.</p>
                  ) : null}
                  {request.rejection_reason ? (
                    <p className="mt-2 text-xs font-black leading-5 text-rose-700">{request.rejection_reason}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Driver earnings</span>
              <strong className="mt-2 block text-2xl font-black text-fleet-night">Every dashboard includes withdrawals</strong>
            </div>
            <Wallet className="h-5 w-5 text-fleet-ember" />
          </div>
          <div className="mt-4 grid gap-3 text-sm font-bold text-slate-600">
            <div className="rounded-fleet bg-fleet-paper p-3">Available: {formatMoney(walletBalance)}</div>
            <div className="rounded-fleet bg-fleet-paper p-3">Locked for pending withdrawals: {formatMoney(lockedBalance)}</div>
            <div className="rounded-fleet bg-fleet-paper p-3">KYC status: {riderProfile.application_status.replaceAll("_", " ")}</div>
          </div>
        </Card>

        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Transaction history</span>
          <div className="mt-4 grid gap-3">
            {(walletTransactions.length
              ? walletTransactions.map((transaction) => [
                  transaction.transaction_type.replaceAll("_", " "),
                  transaction.provider_reference || transaction.provider || transaction.status,
                  transaction.amount_ngn
                ])
              : transactions
            ).map(([label, detail, amount]) => (
              <div key={`${label}-${detail}`} className="flex items-center justify-between gap-4 rounded-fleet bg-fleet-paper p-3">
                <span>
                  <strong className="block text-sm font-black text-fleet-night">{label}</strong>
                  <span className="text-xs font-bold text-slate-500">{detail}</span>
                </span>
                <strong className={Number(amount) < 0 ? "text-rose-600" : "text-emerald-700"}>{formatMoney(Math.abs(Number(amount)))}</strong>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {showKycPrompt && kycNeedsAction ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-fleet-night/70 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Driver KYC required">
          <Card className="relative w-full max-w-xl border-amber-200 bg-white p-5 shadow-[0_28px_90px_rgba(0,0,0,0.35)] sm:p-6">
            <button
              type="button"
              onClick={() => setShowKycPrompt(false)}
              className="absolute right-4 top-4 inline-grid h-10 w-10 place-items-center rounded-full border border-fleet-line bg-white text-fleet-night shadow-lift"
              aria-label="Close KYC prompt"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-fleet bg-amber-50 text-amber-700">
              <FileCheck2 className="h-6 w-6" />
            </span>
            <StatusBadge tone="amber" className="mt-5">
              Driver KYC required
            </StatusBadge>
            <h2 className="mt-3 pr-10 text-3xl font-black leading-tight text-fleet-night">Complete your driver verification.</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
              Upload your identity, vehicle papers, selfie, and bank details. You can view the dashboard now, but jobs and withdrawals require KYC review.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <LinkButton href="/rider/onboarding">
                Open driver KYC
              </LinkButton>
              <Button type="button" variant="secondary" onClick={() => setShowKycPrompt(false)}>
                I&apos;ll do it later
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}

function DriverWalletBankCard({
  balance,
  lockedBalance,
  showBalance,
  onToggleBalance,
  topUpAmount,
  onTopUpAmountChange,
  onTopUp,
  topUpLoading,
  withdrawalAmount,
  onWithdrawalAmountChange,
  onWithdraw,
  withdrawalLoading,
  withdrawalDisabled,
  kycStatusLabel,
  kycApproved,
  withdrawnLast24Hours,
  walletMessage,
  withdrawalMessage
}: {
  balance: number;
  lockedBalance: number;
  showBalance: boolean;
  onToggleBalance: () => void;
  topUpAmount: string;
  onTopUpAmountChange: (value: string) => void;
  onTopUp: () => void;
  topUpLoading: boolean;
  withdrawalAmount: string;
  onWithdrawalAmountChange: (value: string) => void;
  onWithdraw: () => void;
  withdrawalLoading: boolean;
  withdrawalDisabled: boolean;
  kycStatusLabel: string;
  kycApproved: boolean;
  withdrawnLast24Hours: number;
  walletMessage: string | null;
  withdrawalMessage: string | null;
}) {
  const displayBalance = showBalance ? formatMoney(balance) : "NGN ••••••";

  return (
    <Card className="mb-6 overflow-hidden border-fleet-night/10 bg-fleet-night text-white shadow-[0_22px_60px_rgba(8,17,31,0.2)]">
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-fleet-gold">
                <Wallet className="h-4 w-4" />
                Driver wallet
              </span>
              <div className="mt-4 flex items-center gap-3">
                <strong className="text-3xl font-black tracking-normal sm:text-5xl">{displayBalance}</strong>
                <button
                  type="button"
                  onClick={onToggleBalance}
                  className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
                  aria-label={showBalance ? "Hide wallet balance" : "Show wallet balance"}
                >
                  {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-2 max-w-lg text-sm font-semibold leading-6 text-white/68">
                Paystack top-ups credit this rider balance after server verification. Withdrawals are held for admin approval before payout.
              </p>
            </div>
            <StatusBadge tone={kycApproved ? "green" : "amber"} className="shrink-0 bg-white/10 text-white">
              {kycStatusLabel}
            </StatusBadge>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-xs font-bold text-white/78 sm:max-w-xl">
            <div className="rounded-fleet border border-white/10 bg-white/10 p-3">
              <span className="block text-white/48">Locked</span>
              <strong className="mt-1 block text-base text-white">{showBalance ? formatMoney(lockedBalance) : "NGN •••"}</strong>
            </div>
            <div className="rounded-fleet border border-white/10 bg-white/10 p-3">
              <span className="block text-white/48">24h withdrawals</span>
              <strong className="mt-1 block text-base text-white">{showBalance ? formatMoney(withdrawnLast24Hours) : "NGN •••"}</strong>
            </div>
          </div>
        </div>

        <div className="rounded-fleet border border-white/10 bg-white p-3 text-fleet-night shadow-[0_18px_40px_rgba(0,0,0,0.18)] sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-field">
              <span className="form-label">Top-up amount</span>
              <input
                className="form-input"
                value={topUpAmount}
                onChange={(event) => onTopUpAmountChange(event.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="10000"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Withdraw amount</span>
              <input
                className="form-input"
                value={withdrawalAmount}
                onChange={(event) => onWithdrawalAmountChange(event.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="3000"
              />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button type="button" onClick={onTopUp} disabled={topUpLoading || Number(topUpAmount) < 500}>
              {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Top-Up
            </Button>
            <Button type="button" variant="secondary" onClick={onWithdraw} disabled={withdrawalLoading || withdrawalDisabled}>
              {withdrawalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              Withdraw Balance
            </Button>
          </div>

          <p className="mt-3 rounded-fleet bg-fleet-paper p-3 text-xs font-bold leading-5 text-slate-600">
            Minimum withdrawal is NGN 3,000. Maximum is NGN 200,000 per 24 hours.
          </p>
          {!kycApproved ? (
            <p className="mt-2 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
              Complete KYC before withdrawal requests can be approved.
            </p>
          ) : null}
          {walletMessage ? <p className="mt-2 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{walletMessage}</p> : null}
          {withdrawalMessage ? <p className="mt-2 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{withdrawalMessage}</p> : null}
        </div>
      </div>
    </Card>
  );
}

function DriverSmartCards({
  metrics,
  highlights
}: {
  metrics: string[][];
  highlights: Array<[string, string, LucideIcon]>;
}) {
  const [activeCard, setActiveCard] = useState(0);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const cards = [
    ...metrics.map(([label, value, helper]) => ({ label, value, helper, Icon: Gauge })),
    ...highlights.map(([label, value, Icon]) => ({ label, value, helper: "Driver performance signal", Icon }))
  ];

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    const firstCard = cardRefs.current[0];
    if (!firstCard) return;
    const nextIndex = Math.round(node.scrollLeft / (firstCard.offsetWidth + 12));
    setActiveCard(Math.max(0, Math.min(cards.length - 1, nextIndex)));
  }

  function goToCard(index: number) {
    cardRefs.current[index]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    setActiveCard(index);
  }

  return (
    <div>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3 [scrollbar-width:none] xl:grid xl:grid-cols-4 xl:overflow-visible xl:pb-0 [&::-webkit-scrollbar]:hidden" onScroll={handleScroll}>
        {cards.map(({ label, value, helper, Icon }, index) => (
          <article
            key={`${label}-${value}`}
            ref={(node) => {
              cardRefs.current[index] = node;
            }}
            className="relative min-h-[118px] w-[min(48vw,178px)] shrink-0 snap-start overflow-hidden rounded-fleet border border-fleet-line bg-white p-3 shadow-[0_10px_24px_rgba(8,17,31,0.07)] transition hover:-translate-y-1 hover:shadow-lift xl:w-auto"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-fleet-ember via-fleet-gold to-fleet-leaf" />
            <span className="grid h-8 w-8 place-items-center rounded-fleet bg-fleet-night text-white">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <strong className="mt-3 block text-xl font-black text-fleet-night">{value}</strong>
            <span className="mt-0.5 block text-xs font-black text-slate-700">{label}</span>
            <span className="mt-1 block text-[0.68rem] font-bold leading-4 text-slate-500">{helper}</span>
          </article>
        ))}
      </div>
      <div className="mt-1 flex justify-center gap-2 xl:hidden" aria-label="Driver dashboard card pages">
        {cards.map((card, index) => (
          <button
            key={`${card.label}-${index}`}
            type="button"
            aria-label={`Show ${card.label}`}
            onClick={() => goToCard(index)}
            className={cn("h-2 rounded-full transition-all", activeCard === index ? "w-6 bg-fleet-ember" : "w-2 bg-slate-300")}
          />
        ))}
      </div>
    </div>
  );
}

function RiderComingSoon({
  state,
  profile,
  liveStates
}: {
  state: string;
  profile: { email?: string | null; phone?: string | null };
  liveStates: string[];
}) {
  return (
    <section className="section-wrap py-10 sm:py-14">
      <Card className="grid gap-0 overflow-hidden lg:grid-cols-[0.96fr_1.04fr]">
        <div className="p-6 sm:p-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-amber-700">
            <Bell className="h-4 w-4" />
            Rider launch waitlist
          </span>
          <h1 className="mt-5 text-4xl font-black leading-tight text-fleet-night sm:text-6xl">COMING SOON TO YOUR STATE</h1>
          <p className="mt-4 max-w-xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
            Rider operations are live in {launchStateLabel(liveStates)}. Your {state} rider profile can stay on the waitlist while we prepare dispatch coverage there.
          </p>
          <div className="mt-7">
            <JoinStateWaitlistButton state={state} email={profile.email} phone={profile.phone} />
          </div>
        </div>
        <div className="min-h-[360px] bg-fleet-night p-4">
          <RoutePreview className="h-full min-h-[330px]" label={`${state} rider launch`} status="searching" riderName="Rider network preparing" />
        </div>
      </Card>
    </section>
  );
}
