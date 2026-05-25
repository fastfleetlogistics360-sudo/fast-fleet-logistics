"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Banknote, Bike, Clock, Home, Loader2, PackageCheck, ShieldAlert, Star, ToggleLeft, ToggleRight, UserRound, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, initials } from "@/lib/format";
import { geolocationErrorMessage, getLocationPermissionState, requestCurrentPosition } from "@/lib/location/geolocation";
import { AccountDeletionButton } from "@/components/dashboard/account-deletion";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { RoutePreview } from "@/components/maps/route-preview";
import type { LiveRiderLocation } from "@/components/realtime/use-live-delivery-tracking";
import { WalletDashboardCard } from "@/components/wallet/wallet-dashboard-card";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

type RiderTab = "home" | "jobs" | "earnings" | "account";
type KycStatus = "approved" | "pending_review" | "rejected" | "submitted" | "under_review" | "more_info_required";

type RiderDashboardProps = {
  initialKycStatus?: KycStatus;
  rejectionReason?: string | null;
};

type RiderProfile = {
  id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  lga?: string | null;
  vehicle_type?: string | null;
  plate_number?: string | null;
  vehicle_color?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  rating?: number | null;
  completed_deliveries?: number | null;
  online?: boolean | null;
  application_status?: KycStatus | null;
};

type JobRow = {
  id: string;
  delivery_code: string;
  pickup_address: string;
  pickup_contact?: string | null;
  dropoff_address: string;
  dropoff_contact?: string | null;
  status: string;
  price_ngn: number;
  distance_km?: number | null;
  eta_minutes?: number | null;
  created_at?: string | null;
  proof_url?: string | null;
  metadata?: Record<string, unknown> | null;
  users?: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
};

type WithdrawalRow = {
  id: string;
  amount_ngn: number;
  bank_name: string;
  account_number: string;
  status: string;
  created_at: string;
};

const tabs: Array<{ id: RiderTab; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "jobs", label: "Jobs", icon: PackageCheck },
  { id: "earnings", label: "Earnings", icon: WalletCards },
  { id: "account", label: "Account", icon: UserRound }
];

const jobFields =
  "id, delivery_code, pickup_address, pickup_contact, dropoff_address, dropoff_contact, status, price_ngn, distance_km, eta_minutes, created_at, proof_url, rider_id, vehicle_type, metadata, users:users!deliveries_customer_id_fkey(full_name, phone, email)";

export function RiderAccessState({ status, rejectionReason }: { status: KycStatus; rejectionReason?: string | null }) {
  const rejected = status === "rejected";
  return (
    <section className="section-wrap py-10">
      <Card className="mx-auto max-w-2xl p-6 text-center">
        <span className={cn("mx-auto grid h-16 w-16 place-items-center rounded-full", rejected ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
          <ShieldAlert className="h-8 w-8" />
        </span>
        <StatusBadge tone={rejected ? "red" : "amber"} className="mt-5">{rejected ? "Rejected" : "Pending review"}</StatusBadge>
        <h1 className="mt-3 text-3xl font-black text-fleet-night">{rejected ? "Your rider application needs attention" : "Your application is under review"}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {rejected ? rejectionReason || "FastFleet operations rejected this application. Please review the note and re-apply." : "We review rider applications within 48 hours. You will receive an SMS and email when a decision is made."}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href="/rider/onboarding">{rejected ? "Re-apply" : "Update application"}</LinkButton>
          <LinkButton href="/support" variant="secondary">Contact support</LinkButton>
        </div>
      </Card>
    </section>
  );
}

async function loadRiderJobs(supabase: ReturnType<typeof createClient>, riderId: string | null, vehicleType: string | null | undefined, includeAvailable: boolean) {
  try {
    const response = await fetch(`/api/rider/jobs?includeAvailable=${includeAvailable ? "1" : "0"}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { jobs?: JobRow[] };
    if (response.ok && Array.isArray(payload.jobs)) return payload.jobs;
  } catch {
    // Fall back to the browser Supabase client below when the API is unavailable in local preview.
  }
  if (!riderId) return [] as JobRow[];
  const [assignedResult, availableResult] = await Promise.all([
    supabase.from("deliveries").select(jobFields).eq("rider_id", riderId).order("created_at", { ascending: false }).limit(40),
    includeAvailable && vehicleType
      ? supabase
          .from("deliveries")
          .select(jobFields)
          .eq("status", "searching")
          .is("rider_id", null)
          .eq("vehicle_type", vehicleType)
          .order("created_at", { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] })
  ]);
  const assigned = ((assignedResult.data || []) as JobRow[]).filter(Boolean);
  const available = ((availableResult.data || []) as JobRow[]).filter((job) => !isRejectedByRider(job, riderId));
  return mergeJobs([...available, ...assigned]);
}

function normalizeDispatchVehicle(vehicleType: string | null | undefined) {
  if (vehicleType === "car" || vehicleType === "van" || vehicleType === "bike") return vehicleType;
  if (vehicleType === "motorcycle" || vehicleType === "tricycle") return "bike";
  return null;
}

function mergeJobs(jobs: JobRow[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function isRejectedByRider(job: JobRow, riderId: string | null | undefined) {
  const rejectedIds = job.metadata?.rejected_rider_ids;
  return Boolean(riderId && Array.isArray(rejectedIds) && rejectedIds.includes(riderId));
}

export function RiderDashboard({ initialKycStatus = "approved", rejectionReason }: RiderDashboardProps) {
  const [activeTab, setActiveTab] = useState<RiderTab>("home");
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [onlineSince, setOnlineSince] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("0m");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [profile, setProfile] = useState<RiderProfile>({});
  const [walletBalance, setWalletBalance] = useState(0);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [incomingExpires, setIncomingExpires] = useState(30);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalMessage, setWithdrawalMessage] = useState<string | null>(null);
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [prefs, setPrefs] = useState({ jobs: true, payouts: true, sms: true });
  const [liveLocation, setLiveLocation] = useState<LiveRiderLocation | null>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [trackingMessage, setTrackingMessage] = useState<string | null>(null);
  const [offerNotice, setOfferNotice] = useState<string | null>(null);

  const incomingJob = jobs.find((job) => job.status === "searching") || null;
  const activeJob = jobs.find((job) => ["accepted", "rider_arrived", "picked_up", "in_transit"].includes(job.status)) || null;
  const recentTrips = jobs.filter((job) => job.status === "delivered").slice(0, 5);
  const firstName = (profile.full_name || "Rider").split(/\s+/)[0] || "Rider";
  const todayEarnings = jobs.filter((job) => job.status === "delivered").reduce((sum, job) => sum + Number(job.price_ngn || 0), 0);

  useEffect(() => {
    if (!onlineSince) return;
    const timer = window.setInterval(() => {
      const minutes = Math.floor((Date.now() - onlineSince.getTime()) / 60000);
      const hours = Math.floor(minutes / 60);
      setElapsed(hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [onlineSince]);

  useEffect(() => {
    if (!incomingJob) return;
    setIncomingExpires(30);
    const timer = window.setInterval(() => {
      setIncomingExpires((value) => {
        if (value <= 1) {
          setJobs((current) => current.filter((job) => job.id !== incomingJob.id));
          return 30;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [incomingJob?.id]);

  useEffect(() => {
    if (!trackingActive || !online || !profile.id || !activeJob) return;
    if (["delivered", "cancelled"].includes(activeJob.status)) {
      setTrackingActive(false);
      setTrackingMessage("Delivery tracking stopped.");
      return;
    }

    const supabase = createClient();
    const riderProfileId = profile.id;
    const trackingJob = activeJob;
    let stopped = false;

    async function publishLocation() {
      try {
        const position = await requestCurrentPosition();
        if (stopped) return;
        const nextLocation: LiveRiderLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          updated_at: new Date().toISOString()
        };
        setLiveLocation(nextLocation);
        setTrackingMessage("Live delivery tracking is on.");
        void Promise.allSettled([
          supabase.from("rider_locations").upsert(
            {
              rider_profile_id: riderProfileId,
              zone: profile.lga || "Lagos",
              latitude: nextLocation.latitude,
              longitude: nextLocation.longitude,
              heading: nextLocation.heading,
              speed: nextLocation.speed,
              updated_at: nextLocation.updated_at
            },
            { onConflict: "rider_profile_id" }
          ),
          supabase.from("delivery_locations").upsert(
            {
              order_id: trackingJob.id,
              rider_id: riderProfileId,
              latitude: nextLocation.latitude,
              longitude: nextLocation.longitude,
              heading: nextLocation.heading,
              speed: nextLocation.speed,
              status: trackingJob.status,
              updated_at: nextLocation.updated_at
            },
            { onConflict: "order_id" }
          )
        ]);
      } catch (error) {
        if (!stopped) setTrackingMessage(geolocationErrorMessage(error));
      }
    }

    publishLocation();
    const timer = window.setInterval(publishLocation, 7000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeJob?.id, activeJob?.status, online, profile.id, profile.lga, trackingActive]);

  useEffect(() => {
    if (trackingActive && !activeJob) {
      setTrackingActive(false);
      setTrackingMessage("Delivery tracking stopped.");
    }
  }, [activeJob, trackingActive]);

  async function startDeliveryTracking() {
    if (!activeJob) {
      setTrackingMessage("Accept an active delivery before starting tracking.");
      return;
    }
    if (!online) {
      setTrackingMessage("Go online before starting delivery tracking.");
      return;
    }
    const permission = await getLocationPermissionState();
    setTrackingMessage(permission === "denied" ? "Location permission is blocked. Enable it in your browser or phone settings." : "Requesting location permission...");
    setTrackingActive(true);
  }

  function stopDeliveryTracking() {
    setTrackingActive(false);
    setTrackingMessage("Delivery tracking paused.");
  }

	  useEffect(() => {
	    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) return;

        const [profileResult, riderResult, walletResult] = await Promise.all([
          supabase.from("profiles").select("full_name, email, phone, lga").eq("user_id", user.id).maybeSingle(),
          supabase.from("rider_profiles").select("id, vehicle_type, plate_number, vehicle_color, bank_name, account_number, account_name, rating, completed_deliveries, online, application_status").eq("user_id", user.id).maybeSingle(),
          supabase.from("wallets").select("balance_ngn").eq("user_id", user.id).maybeSingle()
        ]);
	        let riderData = (riderResult.data as RiderProfile | null) || {};
	        const dispatchVehicle = normalizeDispatchVehicle(riderData.vehicle_type) || "bike";
	        let riderId = riderData.id || null;
	        const approved = riderData.application_status === "approved" || initialKycStatus === "approved";
	        const effectiveOnline = approved ? true : Boolean(riderData.online);
	        if (riderId && approved && (!riderData.online || riderData.vehicle_type !== dispatchVehicle || riderData.application_status !== "approved")) {
	          await supabase.from("rider_profiles").update({ application_status: "approved", online: true, vehicle_type: dispatchVehicle }).eq("id", riderId);
	        }
	        const [jobsResult, withdrawalsResult] = await Promise.all([
	          riderId || approved
	            ? loadRiderJobs(supabase, riderId, dispatchVehicle, effectiveOnline)
	            : Promise.resolve({ data: [] }),
	          riderId
	            ? supabase.from("withdrawal_requests").select("id, amount_ngn, bank_name, account_number, status, created_at").eq("rider_profile_id", riderId).order("created_at", { ascending: false }).limit(12)
	            : Promise.resolve({ data: [] })
	        ]);
	        if (!riderId && approved) {
	          const repaired = await supabase
	            .from("rider_profiles")
	            .select("id, vehicle_type, plate_number, vehicle_color, bank_name, account_number, account_name, rating, completed_deliveries, online, application_status")
	            .eq("user_id", user.id)
	            .maybeSingle();
	          riderData = ((repaired.data as RiderProfile | null) || riderData);
	          riderId = riderData.id || null;
	        }
        if (!mounted) return;
        const nextProfile = { ...((profileResult.data || {}) as RiderProfile), ...riderData, application_status: approved ? "approved" : riderData.application_status, vehicle_type: dispatchVehicle, online: effectiveOnline };
        setProfile(nextProfile);
        setOnline(Boolean(nextProfile.online));
        setOnlineSince(nextProfile.online ? new Date() : null);
        setWalletBalance(Number((walletResult.data as { balance_ngn?: number } | null)?.balance_ngn || 0));
	        setJobs(Array.isArray(jobsResult) ? jobsResult : ((jobsResult.data || []) as JobRow[]));
        setWithdrawals((withdrawalsResult.data || []) as WithdrawalRow[]);
      } catch {
        if (mounted) setJobs([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
	    return () => {
	      mounted = false;
	    };
	  }, []);

	  useEffect(() => {
	    if (!online || !profile.id) return;
	    const supabase = createClient();
	    let mounted = true;
	    const dispatchVehicle = normalizeDispatchVehicle(profile.vehicle_type) || "bike";

	    async function refreshAvailableJobs() {
	      const nextJobs = await loadRiderJobs(supabase, profile.id || null, dispatchVehicle, true);
	      if (!mounted) return;
	      setJobs((current) => {
	        const nextIds = new Set(nextJobs.map((job) => job.id));
	        const removedIncoming = current.find((job) => job.status === "searching" && !nextIds.has(job.id) && !isRejectedByRider(job, profile.id));
	        if (removedIncoming) setOfferNotice(`${removedIncoming.delivery_code} has been accepted by another rider.`);
	        return nextJobs;
	      });
	    }

	    const channel = supabase
	      .channel(`rider-available-jobs:${profile.id}`)
	      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, (payload) => {
	        const next = payload.new as Partial<JobRow> & { rider_id?: string | null; vehicle_type?: string | null };
	        if (next?.vehicle_type === dispatchVehicle || next?.rider_id === profile.id) void refreshAvailableJobs();
	      })
	      .subscribe();
	    void refreshAvailableJobs();
	    const timer = window.setInterval(refreshAvailableJobs, 8000);

	    return () => {
	      mounted = false;
	      window.clearInterval(timer);
	      supabase.removeChannel(channel);
	    };
	  }, [online, profile.id, profile.vehicle_type]);
	
	  async function toggleOnline() {
    if (profile.application_status !== "approved" && initialKycStatus !== "approved") {
      setOnline(false);
      setOnlineSince(null);
      return;
    }
    const nextOnline = !online;
    setOnline(nextOnline);
    setOnlineSince(nextOnline ? new Date() : null);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
        const dispatchVehicle = normalizeDispatchVehicle(profile.vehicle_type) || "bike";
	      const { error } = await supabase.from("rider_profiles").update({ online: nextOnline, vehicle_type: dispatchVehicle }).eq("user_id", user.id);
	      if (error) throw error;
        setProfile((current) => ({ ...current, vehicle_type: dispatchVehicle, online: nextOnline }));
	      if (nextOnline && profile.id) {
	        const nextJobs = await loadRiderJobs(supabase, profile.id, dispatchVehicle, true);
	        setJobs(nextJobs);
	        setOfferNotice(nextJobs.some((job) => job.status === "searching") ? "New dispatch orders are available." : null);
	      }
	    } catch (error) {
      setOnline(!nextOnline);
      setOnlineSince(!nextOnline ? new Date() : null);
    }
  }

	  async function respondToJob(job: JobRow, accepted: boolean) {
	    try {
	      setOfferNotice(null);
	      const response = await fetch("/api/rider/jobs", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({ id: job.id, action: accepted ? "accept" : "decline" })
	      });
	      const payload = await response.json();
	      if (!response.ok) throw new Error(payload.error || "Could not update job.");
	      setJobs((current) => accepted ? [payload.job as JobRow, ...current.filter((item) => item.id !== job.id && item.status !== "searching")] : current.filter((item) => item.id !== job.id));
	      if (accepted) {
	        setTrackingMessage("Job accepted. Requesting location permission for live delivery tracking...");
	        setTrackingActive(true);
	      }
	    } catch (error) {
	      const message = error instanceof Error ? error.message : "Could not update job.";
	      setOfferNotice(message.includes("accepted by another rider") ? `${job.delivery_code} has been accepted by another rider.` : message);
	      setJobs((current) => current.filter((item) => item.id !== job.id || !message.includes("accepted by another rider")));
	    }
	  }

  async function advanceJob(job: JobRow) {
    try {
      const supabase = createClient();
      if (job.status === "picked_up" && proofFile) {
        const extension = proofFile.name.split(".").pop() || "jpg";
        const path = `${profile.id || "rider"}/${job.id}-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("delivery-proofs").upload(path, proofFile);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("delivery-proofs").getPublicUrl(path);
        const { error: proofError } = await supabase.from("deliveries").update({ proof_url: data.publicUrl }).eq("id", job.id);
        if (proofError) throw proofError;
      }
      const response = await fetch("/api/rider/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, action: "advance" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not advance delivery.");
      setJobs((current) => current.map((item) => item.id === job.id ? (payload.job as JobRow) : item));
      if ((payload.job as JobRow)?.status === "delivered" || (payload.job as JobRow)?.status === "cancelled") {
        setTrackingActive(false);
        setTrackingMessage("Delivery tracking stopped.");
      }
      setProofFile(null);
    } catch {
      // Keep the current server state visible when the action fails.
    }
  }

  async function requestWithdrawal() {
    const amount = Number(withdrawalAmount);
    setWithdrawalMessage(null);
    if (!amount || amount < 3000) {
      setWithdrawalMessage("Enter an amount of at least NGN 3,000.");
      return;
    }
    setWithdrawalLoading(true);
    try {
      const response = await fetch("/api/rider/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not request withdrawal.");
      setWithdrawals((current) => [payload.withdrawal as WithdrawalRow, ...current]);
      setWalletBalance((current) => Math.max(0, current - amount));
      setWithdrawalMessage("Withdrawal request submitted for admin payout review.");
      setWithdrawalOpen(false);
    } catch (error) {
      setWithdrawalMessage(error instanceof Error ? error.message : "Could not request withdrawal.");
    } finally {
      setWithdrawalLoading(false);
    }
  }

  if (initialKycStatus !== "approved") return <RiderAccessState status={initialKycStatus} rejectionReason={rejectionReason} />;

  return (
    <section className="min-h-screen bg-fleet-paper pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[260px_1fr]">
        <DesktopNav activeTab={activeTab} onChange={setActiveTab} />
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:py-8">
          <header className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-fleet-night sm:text-4xl">Ride workspace, {firstName}</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">Jobs, earnings, and account controls in one mobile-first dashboard.</p>
            </div>
            <NotificationBell />
          </header>
	          {activeTab === "home" ? <HomeTab loading={loading} online={online} elapsed={elapsed} onToggleOnline={toggleOnline} todayEarnings={todayEarnings} profile={profile} incomingJob={incomingJob} incomingExpires={incomingExpires} activeJob={activeJob} recentTrips={recentTrips} proofFile={proofFile} liveLocation={liveLocation} trackingActive={trackingActive} trackingMessage={trackingMessage} offerNotice={offerNotice} onStartTracking={startDeliveryTracking} onStopTracking={stopDeliveryTracking} onProofFile={setProofFile} onRespond={respondToJob} onAdvance={advanceJob} /> : null}
          {activeTab === "jobs" ? <JobsTab loading={loading} jobs={jobs} online={online} onToggleOnline={toggleOnline} /> : null}
          {activeTab === "earnings" ? <EarningsTab walletBalance={walletBalance} profile={profile} withdrawals={withdrawals} onOpenWithdrawal={() => setWithdrawalOpen(true)} /> : null}
          {activeTab === "account" ? <AccountTab profile={profile} kycStatus={profile.application_status || initialKycStatus} prefs={prefs} onPrefs={setPrefs} /> : null}
        </main>
      </div>
	      <MobileTabs activeTab={activeTab} onChange={setActiveTab} />
	      {online && incomingJob ? <IncomingJobModal job={incomingJob} expires={incomingExpires} onRespond={respondToJob} /> : null}
	      {withdrawalOpen ? <WithdrawalModal amount={withdrawalAmount} onAmount={setWithdrawalAmount} profile={profile} loading={withdrawalLoading} message={withdrawalMessage} onClose={() => setWithdrawalOpen(false)} onSubmit={requestWithdrawal} /> : null}
    </section>
  );
}

function DesktopNav({ activeTab, onChange }: { activeTab: RiderTab; onChange: (tab: RiderTab) => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen border-r border-fleet-line bg-white p-4 lg:block">
      <div className="rounded-fleet bg-fleet-navy p-4 text-white">
        <span className="text-xl font-black">FastFleet</span>
        <p className="mt-1 text-xs font-semibold text-white/70">Rider app</p>
      </div>
      <nav className="mt-5 grid gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn("flex items-center gap-3 rounded-fleet px-3 py-3 text-sm font-black", activeTab === tab.id ? "bg-fleet-navy text-white" : "text-slate-600 hover:bg-fleet-paper")}><Icon className="h-4 w-4" />{tab.label}</button>;
        })}
      </nav>
    </aside>
  );
}

function MobileTabs({ activeTab, onChange }: { activeTab: RiderTab; onChange: (tab: RiderTab) => void }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 rounded-fleet border border-fleet-line bg-white/95 p-1 shadow-glow backdrop-blur lg:hidden">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn("grid min-h-14 place-items-center rounded-fleet text-[0.7rem] font-black", activeTab === tab.id ? "bg-fleet-navy text-white" : "text-slate-500")}><Icon className="h-4 w-4" />{tab.label}</button>;
      })}
    </nav>
  );
}

function HomeTab({ loading, online, elapsed, onToggleOnline, todayEarnings, profile, incomingJob, incomingExpires, activeJob, recentTrips, proofFile, liveLocation, trackingActive, trackingMessage, offerNotice, onStartTracking, onStopTracking, onProofFile, onRespond, onAdvance }: { loading: boolean; online: boolean; elapsed: string; onToggleOnline: () => void; todayEarnings: number; profile: RiderProfile; incomingJob: JobRow | null; incomingExpires: number; activeJob: JobRow | null; recentTrips: JobRow[]; proofFile: File | null; liveLocation: LiveRiderLocation | null; trackingActive: boolean; trackingMessage: string | null; offerNotice: string | null; onStartTracking: () => void; onStopTracking: () => void; onProofFile: (file: File | null) => void; onRespond: (job: JobRow, accepted: boolean) => void; onAdvance: (job: JobRow) => void }) {
  if (loading) return <DashboardSkeleton />;
  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <button type="button" onClick={onToggleOnline} className={cn("flex w-full items-center justify-between rounded-fleet p-5 text-left transition", online ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600")}>
          <span><strong className="block text-2xl font-black">{online ? "Go offline" : "Go online"}</strong><span className="text-sm font-bold">{online ? `Online for ${elapsed}` : "Paused from dispatch"}</span></span>
          {online ? <ToggleRight className="h-12 w-12" /> : <ToggleLeft className="h-12 w-12" />}
        </button>
      </Card>
	      <div className="grid grid-cols-3 gap-3">
	        <Stat label="Trips" value={String(profile.completed_deliveries || recentTrips.length)} />
	        <Stat label="Today" value={formatMoney(todayEarnings)} />
	        <Stat label="Rating" value={(profile.rating || 4.9).toFixed(1)} />
	      </div>
	      {offerNotice ? <div className="rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-800">{offerNotice}</div> : null}
	      {incomingJob ? <IncomingJob job={incomingJob} expires={incomingExpires} onRespond={onRespond} /> : <DashboardEmptyState title="No incoming job" body="Go online and new dispatch offers will appear here." ctaLabel="Open jobs" ctaHref="/rider/dashboard" icon={<Bike className="h-7 w-7" />} />}
      {activeJob ? <ActiveJob job={activeJob} proofFile={proofFile} liveLocation={liveLocation} trackingActive={trackingActive} trackingMessage={trackingMessage} onStartTracking={onStartTracking} onStopTracking={onStopTracking} onProofFile={onProofFile} onAdvance={onAdvance} /> : null}
      <Card className="overflow-hidden p-0">
        <RoutePreview
          compact
          className="rounded-none border-0"
          label="Rider live map"
          status={activeJob?.status}
          riderName={profile.full_name || "FastFleet rider"}
          pickupAddress={activeJob?.pickup_address || "Victoria Island, Lagos"}
          dropoffAddress={activeJob?.dropoff_address || "Ikeja GRA, Lagos"}
          riderLocation={liveLocation}
        />
      </Card>
      <section>
        <h2 className="mb-3 text-xl font-black text-fleet-night">Recent trips</h2>
        <div className="grid gap-3">
          {recentTrips.length ? recentTrips.map((job) => <TripCard key={job.id} job={job} />) : (
            <Card className="p-5 text-center">
              <h3 className="text-xl font-black text-fleet-night">No completed trips</h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">Accepted jobs will move here after delivery.</p>
              <Button type="button" className="mt-4" onClick={onToggleOnline}>{online ? "Go offline" : "Go online"}</Button>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

function IncomingJob({ job, expires, onRespond }: { job: JobRow; expires: number; onRespond: (job: JobRow, accepted: boolean) => void }) {
  return (
    <Card className="border-fleet-gold p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
	          <StatusBadge tone="amber">Incoming job</StatusBadge>
	          <h2 className="mt-3 text-2xl font-black text-fleet-night">{job.pickup_address} to {job.dropoff_address}</h2>
	          <p className="mt-2 text-sm font-semibold text-slate-600">{job.distance_km || 6} km · {formatMoney(job.price_ngn)} estimated earning</p>
	          <p className="mt-2 text-sm font-bold text-slate-600">Customer: {job.users?.full_name || "Customer"} · {job.dropoff_contact || job.pickup_contact || job.users?.phone || "Phone pending"}</p>
	        </div>
	        <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-fleet-navy text-lg font-black text-fleet-navy">{expires}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button type="button" onClick={() => onRespond(job, true)} className="bg-emerald-600 hover:bg-emerald-700">Accept</Button>
        <Button type="button" variant="secondary" onClick={() => onRespond(job, false)}>Decline</Button>
      </div>
    </Card>
	  );
	}

function IncomingJobModal({ job, expires, onRespond }: { job: JobRow; expires: number; onRespond: (job: JobRow, accepted: boolean) => void }) {
  return (
    <div className="fixed inset-0 z-[110] grid place-items-end bg-fleet-night/35 p-3 sm:place-items-center">
      <div className="w-full max-w-lg">
        <IncomingJob job={job} expires={expires} onRespond={onRespond} />
      </div>
    </div>
  );
}

function ActiveJob({ job, proofFile, liveLocation, trackingActive, trackingMessage, onStartTracking, onStopTracking, onProofFile, onAdvance }: { job: JobRow; proofFile: File | null; liveLocation: LiveRiderLocation | null; trackingActive: boolean; trackingMessage: string | null; onStartTracking: () => void; onStopTracking: () => void; onProofFile: (file: File | null) => void; onAdvance: (job: JobRow) => void }) {
  const label = job.status === "accepted" ? "I've arrived at pickup" : job.status === "rider_arrived" ? "Package collected" : job.status === "picked_up" ? "Start trip" : job.status === "in_transit" ? "Delivered" : "Complete delivery";
  return (
    <Card className="p-5">
	      <StatusBadge tone="blue">Active delivery</StatusBadge>
	      <h2 className="mt-3 text-xl font-black text-fleet-night">{job.delivery_code}</h2>
	      <p className="mt-2 text-sm font-semibold text-slate-600">{job.pickup_address} to {job.dropoff_address}</p>
	      <div className="mt-3 grid gap-2 rounded-fleet bg-fleet-paper p-3 text-sm font-bold text-slate-600">
	        <span>Customer: {job.users?.full_name || "Customer"}</span>
	        <span>Phone: {job.dropoff_contact || job.pickup_contact || job.users?.phone || "Not provided"}</span>
	      </div>
	      <RoutePreview
        compact
        className="mt-4"
        label="Active route"
        status={job.status}
        riderName="Your route"
        pickupAddress={job.pickup_address}
        dropoffAddress={job.dropoff_address}
        riderLocation={liveLocation}
      />
      {job.status === "picked_up" ? (
        <label className="form-field mt-4">
          <span className="form-label">Proof of delivery photo</span>
          <input className="form-input py-3" type="file" accept="image/*" onChange={(event) => onProofFile(event.target.files?.[0] || null)} />
          {proofFile ? <span className="text-xs font-bold text-slate-500">{proofFile.name}</span> : null}
        </label>
      ) : null}
	      <div className="mt-4 grid gap-2">
	        {(job.dropoff_contact || job.pickup_contact || job.users?.phone) ? (
	          <LinkButton href={`tel:${job.dropoff_contact || job.pickup_contact || job.users?.phone}`} variant="secondary" className="w-full">
	            Call customer
	          </LinkButton>
	        ) : null}
	        <Button type="button" variant={trackingActive ? "secondary" : "primary"} onClick={trackingActive ? onStopTracking : onStartTracking}>
	          {trackingActive ? "Stop Delivery Tracking" : "Start Delivery Tracking"}
        </Button>
      </div>
      {trackingMessage ? <div className="mt-3 rounded-fleet bg-fleet-paper p-3 text-xs font-bold leading-5 text-slate-600">{trackingMessage}</div> : null}
      <Button type="button" className="mt-4 w-full bg-fleet-navy hover:bg-fleet-night" onClick={() => onAdvance(job)}>{label}</Button>
    </Card>
  );
}

function JobsTab({ loading, jobs, online, onToggleOnline }: { loading: boolean; jobs: JobRow[]; online: boolean; onToggleOnline: () => void }) {
  const [filter, setFilter] = useState<"active" | "available" | "completed">("active");
  if (loading) return <DashboardSkeleton />;
  const filteredJobs = jobs.filter((job) => {
    if (filter === "available") return job.status === "searching";
    if (filter === "completed") return job.status === "delivered";
    return ["accepted", "rider_arrived", "picked_up", "in_transit"].includes(job.status);
  });
  return (
    <div className="grid gap-4">
      <div className="flex gap-2">{(["active", "available", "completed"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn("rounded-full px-4 py-2 text-sm font-black capitalize", filter === item ? "bg-fleet-navy text-white" : "bg-white text-slate-600")}>{item}</button>)}</div>
      {filteredJobs.length ? filteredJobs.map((job) => <TripCard key={job.id} job={job} />) : (
        <Card className="p-5 text-center">
          <h3 className="text-xl font-black text-fleet-night">No jobs in this view</h3>
          <p className="mt-2 text-sm font-semibold text-slate-600">Go online to receive offers, then accept and advance each job from pickup to delivery.</p>
          <Button type="button" className="mt-4" onClick={onToggleOnline}>{online ? "Go offline" : "Go online"}</Button>
        </Card>
      )}
    </div>
  );
}

function EarningsTab({ walletBalance, profile, withdrawals, onOpenWithdrawal }: { walletBalance: number; profile: RiderProfile; withdrawals: WithdrawalRow[]; onOpenWithdrawal: () => void }) {
  const settledWithdrawals = withdrawals.slice(0, 14).map((item) => Number(item.amount_ngn || 0));
  const chartValues = settledWithdrawals.length ? settledWithdrawals : [0];
  const max = Math.max(...chartValues, 1);
  return (
    <div className="grid gap-5">
      <WalletDashboardCard
        userName={profile.full_name?.trim().split(/\s+/)[0] || "Rider"}
        balance={walletBalance}
        walletType="rider"
        accountKind="rider"
        kycStatus={(profile.application_status || "approved") === "approved" ? "verified" : "pending"}
        returnTo="/rider/dashboard"
        onWithdraw={onOpenWithdrawal}
        transactionHref="/rider/dashboard/earnings"
      />
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Last 14 days</h2>
        <div className="mt-5 flex h-48 items-end gap-2">
          {chartValues.map((value, index) => <span key={`${value}-${index}`} className="flex-1 rounded-t bg-fleet-navy" style={{ height: `${Math.max(12, (value / max) * 100)}%` }} title={formatMoney(value)} />)}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Withdrawal history</h2>
        <div className="mt-4 grid gap-3">{withdrawals.length ? withdrawals.map((item) => <div key={item.id} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3"><span><strong className="block text-sm font-black text-fleet-night">{formatMoney(item.amount_ngn)}</strong><span className="text-xs font-semibold text-slate-500">{formatDateTime(item.created_at)}</span></span><StatusBadge tone={item.status === "paid" ? "green" : "amber"}>{item.status}</StatusBadge></div>) : <DashboardEmptyState title="No withdrawals yet" body="Withdrawal requests will appear here after you submit one." ctaLabel="Withdraw" ctaHref="/rider/dashboard" icon={<Banknote className="h-7 w-7" />} />}</div>
      </Card>
    </div>
  );
}

function AccountTab({ profile, kycStatus, prefs, onPrefs }: { profile: RiderProfile; kycStatus: KycStatus; prefs: { jobs: boolean; payouts: boolean; sms: boolean }; onPrefs: (prefs: { jobs: boolean; payouts: boolean; sms: boolean }) => void }) {
  const approved = kycStatus === "approved";
  const kycTone = approved ? "green" : kycStatus === "rejected" ? "red" : "amber";
  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-fleet-navy text-lg font-black text-white">{initials(profile.full_name || "Rider")}</span>
          <div><h2 className="text-xl font-black text-fleet-night">{profile.full_name || "Rider"}</h2><p className="text-sm font-semibold text-slate-500">{profile.phone || "No phone"} · {profile.lga || "Lagos"}</p></div>
        </div>
      </Card>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Vehicle details</h2><div className="mt-4 grid gap-3 text-sm font-bold text-slate-600"><Info label="Vehicle" value={profile.vehicle_type || "Motorcycle"} /><Info label="Plate" value={profile.plate_number || "Pending"} /><Info label="Colour" value={profile.vehicle_color || "Pending"} /></div><p className="mt-4 text-xs font-bold text-slate-500">Vehicle edits require re-submission.</p></Card>
      <Card className="p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black text-fleet-night">KYC document status</h2><StatusBadge tone={kycTone}>{kycStatus.replaceAll("_", " ")}</StatusBadge></div><div className="mt-4 grid gap-2">{["Government ID", "Driver's Licence", "Vehicle registration", "Insurance", "Guarantor letter"].map((item) => <div key={item} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3 text-sm font-black text-fleet-night"><span>{item}</span><StatusBadge tone={kycTone}>{approved ? "Approved" : "Review"}</StatusBadge></div>)}</div><LinkButton href="/rider/onboarding" variant="secondary" className="mt-4 w-full">Update KYC</LinkButton></Card>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Rating breakdown</h2><p className="mt-3 text-3xl font-black text-fleet-night">{(profile.rating || 4.9).toFixed(1)} <Star className="inline h-6 w-6 fill-fleet-gold text-fleet-gold" /></p><p className="mt-1 text-sm font-semibold text-slate-600">{profile.completed_deliveries || 0} total trips</p></Card>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Notifications</h2><div className="mt-4 grid gap-3">{(["jobs", "payouts", "sms"] as const).map((key) => <label key={key} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3 text-sm font-black capitalize text-fleet-night">{key}<input type="checkbox" className="h-5 w-5 accent-fleet-navy" checked={prefs[key]} onChange={(event) => onPrefs({ ...prefs, [key]: event.target.checked })} /></label>)}</div></Card>
      <Card className="p-5"><AccountDeletionButton /><Button type="button" variant="secondary" className="mt-3 w-full" onClick={async () => { const supabase = createClient(); await supabase.auth.signOut(); window.location.assign("/auth"); }}>Sign out</Button></Card>
    </div>
  );
}

function WithdrawalModal({ amount, onAmount, profile, loading, message, onClose, onSubmit }: { amount: string; onAmount: (value: string) => void; profile: RiderProfile; loading: boolean; message: string | null; onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-end bg-fleet-night/35 p-3 sm:place-items-center">
      <Card className="w-full max-w-md p-5">
        <h2 className="text-2xl font-black text-fleet-night">Request withdrawal</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">{profile.bank_name || "Bank pending"} · {profile.account_number || "Account pending"} · {profile.account_name || "Name pending"}</p>
        <label className="form-field mt-5"><span className="form-label">Amount</span><input className="form-input" value={amount} onChange={(event) => onAmount(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="5000" /></label>
        {message ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" disabled={loading || !amount} onClick={onSubmit}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Submit</Button></div>
      </Card>
    </div>
  );
}

function TripCard({ job }: { job: JobRow }) {
  return <article className="rounded-fleet border border-fleet-line bg-white p-4"><div className="flex items-start justify-between gap-3"><span><strong className="block text-sm font-black text-fleet-night">{job.delivery_code}</strong><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{job.pickup_address} to {job.dropoff_address}</span></span><StatusBadge tone={job.status === "delivered" ? "green" : "blue"}>{job.status.replaceAll("_", " ")}</StatusBadge></div><div className="mt-3 flex items-center justify-between text-sm font-black text-fleet-night"><span>{formatMoney(job.price_ngn)}</span><span>{job.eta_minutes || 30} min</span></div></article>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card className="p-3"><p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><strong className="mt-2 block text-lg font-black text-fleet-night">{value}</strong></Card>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-fleet bg-fleet-paper p-3"><span className="block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span><strong className="block text-sm font-black text-fleet-night">{value}</strong></div>;
}

function DashboardSkeleton() {
  return <div className="grid gap-4"><Skeleton className="h-36" /><div className="grid grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-64" /></div>;
}
