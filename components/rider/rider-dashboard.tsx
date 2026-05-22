"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Banknote, Bike, Clock, Home, Loader2, PackageCheck, ShieldAlert, Star, ToggleLeft, ToggleRight, UserRound, WalletCards } from "lucide-react";
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
};

type JobRow = {
  id: string;
  delivery_code: string;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  price_ngn: number;
  distance_km?: number | null;
  eta_minutes?: number | null;
  created_at?: string | null;
  proof_url?: string | null;
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
          supabase.from("rider_profiles").select("id, vehicle_type, plate_number, vehicle_color, bank_name, account_number, account_name, rating, completed_deliveries, online").eq("user_id", user.id).maybeSingle(),
          supabase.from("wallets").select("balance_ngn").eq("user_id", user.id).maybeSingle()
        ]);
        const riderId = (riderResult.data as RiderProfile | null)?.id || null;
        const [jobsResult, withdrawalsResult] = await Promise.all([
          riderId
            ? supabase.from("deliveries").select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, distance_km, eta_minutes, created_at, proof_url").eq("rider_id", riderId).order("created_at", { ascending: false }).limit(40)
            : Promise.resolve({ data: [] }),
          riderId
            ? supabase.from("withdrawal_requests").select("id, amount_ngn, bank_name, account_number, status, created_at").eq("rider_profile_id", riderId).order("created_at", { ascending: false }).limit(12)
            : Promise.resolve({ data: [] })
        ]);
        if (!mounted) return;
        const nextProfile = { ...((profileResult.data || {}) as RiderProfile), ...((riderResult.data || {}) as RiderProfile) };
        setProfile(nextProfile);
        setOnline(Boolean(nextProfile.online));
        setOnlineSince(nextProfile.online ? new Date() : null);
        setWalletBalance(Number((walletResult.data as { balance_ngn?: number } | null)?.balance_ngn || 0));
        setJobs((jobsResult.data || []) as JobRow[]);
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

  async function toggleOnline() {
    const nextOnline = !online;
    setOnline(nextOnline);
    setOnlineSince(nextOnline ? new Date() : null);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("rider_profiles").update({ online: nextOnline }).eq("user_id", user.id);
      if (error) throw error;
      if (nextOnline && profile.id) {
        const { data } = await supabase.rpc("assign_next_delivery_to_rider", { target_rider_profile_id: profile.id });
        if (data) {
          const { data: offeredJob } = await supabase
            .from("deliveries")
            .select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, distance_km, eta_minutes, created_at, proof_url")
            .eq("id", data)
            .single();
          if (offeredJob) setJobs((current) => [offeredJob as JobRow, ...current.filter((job) => job.id !== offeredJob.id)]);
        }
      }
    } catch (error) {
      setOnline(!nextOnline);
      setOnlineSince(!nextOnline ? new Date() : null);
    }
  }

  async function respondToJob(job: JobRow, accepted: boolean) {
    try {
      const response = await fetch("/api/rider/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, action: accepted ? "accept" : "decline" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not update job.");
      setJobs((current) => accepted ? current.map((item) => item.id === job.id ? (payload.job as JobRow) : item) : current.filter((item) => item.id !== job.id));
    } catch {
      // Keep the current server state visible when the action fails.
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
          {activeTab === "home" ? <HomeTab loading={loading} online={online} elapsed={elapsed} onToggleOnline={toggleOnline} todayEarnings={todayEarnings} profile={profile} incomingJob={incomingJob} incomingExpires={incomingExpires} activeJob={activeJob} recentTrips={recentTrips} proofFile={proofFile} onProofFile={setProofFile} onRespond={respondToJob} onAdvance={advanceJob} /> : null}
          {activeTab === "jobs" ? <JobsTab loading={loading} jobs={jobs} /> : null}
          {activeTab === "earnings" ? <EarningsTab walletBalance={walletBalance} withdrawals={withdrawals} onOpenWithdrawal={() => setWithdrawalOpen(true)} /> : null}
          {activeTab === "account" ? <AccountTab profile={profile} prefs={prefs} onPrefs={setPrefs} /> : null}
        </main>
      </div>
      <MobileTabs activeTab={activeTab} onChange={setActiveTab} />
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

function HomeTab({ loading, online, elapsed, onToggleOnline, todayEarnings, profile, incomingJob, incomingExpires, activeJob, recentTrips, proofFile, onProofFile, onRespond, onAdvance }: { loading: boolean; online: boolean; elapsed: string; onToggleOnline: () => void; todayEarnings: number; profile: RiderProfile; incomingJob: JobRow | null; incomingExpires: number; activeJob: JobRow | null; recentTrips: JobRow[]; proofFile: File | null; onProofFile: (file: File | null) => void; onRespond: (job: JobRow, accepted: boolean) => void; onAdvance: (job: JobRow) => void }) {
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
      {incomingJob ? <IncomingJob job={incomingJob} expires={incomingExpires} onRespond={onRespond} /> : <DashboardEmptyState title="No incoming job" body="Go online and new dispatch offers will appear here." ctaLabel="Open jobs" ctaHref="/rider/dashboard" icon={<Bike className="h-7 w-7" />} />}
      {activeJob ? <ActiveJob job={activeJob} proofFile={proofFile} onProofFile={onProofFile} onAdvance={onAdvance} /> : null}
      <section>
        <h2 className="mb-3 text-xl font-black text-fleet-night">Recent trips</h2>
        <div className="grid gap-3">{recentTrips.length ? recentTrips.map((job) => <TripCard key={job.id} job={job} />) : <DashboardEmptyState title="No completed trips" body="Accepted jobs will move here after delivery." ctaLabel="Go online" ctaHref="/rider/dashboard" />}</div>
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

function ActiveJob({ job, proofFile, onProofFile, onAdvance }: { job: JobRow; proofFile: File | null; onProofFile: (file: File | null) => void; onAdvance: (job: JobRow) => void }) {
  const label = job.status === "accepted" ? "I've arrived at pickup" : job.status === "rider_arrived" ? "Package collected" : job.status === "picked_up" ? "Delivered" : "Complete delivery";
  return (
    <Card className="p-5">
      <StatusBadge tone="blue">Active delivery</StatusBadge>
      <h2 className="mt-3 text-xl font-black text-fleet-night">{job.delivery_code}</h2>
      <p className="mt-2 text-sm font-semibold text-slate-600">{job.pickup_address} to {job.dropoff_address}</p>
      {job.status === "picked_up" ? (
        <label className="form-field mt-4">
          <span className="form-label">Proof of delivery photo</span>
          <input className="form-input py-3" type="file" accept="image/*" onChange={(event) => onProofFile(event.target.files?.[0] || null)} />
          {proofFile ? <span className="text-xs font-bold text-slate-500">{proofFile.name}</span> : null}
        </label>
      ) : null}
      <Button type="button" className="mt-4 w-full bg-fleet-navy hover:bg-fleet-night" onClick={() => onAdvance(job)}>{label}</Button>
    </Card>
  );
}

function JobsTab({ loading, jobs }: { loading: boolean; jobs: JobRow[] }) {
  const [filter, setFilter] = useState<"today" | "week" | "month">("today");
  if (loading) return <DashboardSkeleton />;
  return (
    <div className="grid gap-4">
      <div className="flex gap-2">{(["today", "week", "month"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn("rounded-full px-4 py-2 text-sm font-black capitalize", filter === item ? "bg-fleet-navy text-white" : "bg-white text-slate-600")}>{item === "week" ? "This week" : item === "month" ? "This month" : "Today"}</button>)}</div>
      {jobs.length ? jobs.map((job) => <TripCard key={job.id} job={job} />) : <DashboardEmptyState title="No trips" body="Your trip history will appear here." ctaLabel="Go online" ctaHref="/rider/dashboard" />}
    </div>
  );
}

function EarningsTab({ walletBalance, withdrawals, onOpenWithdrawal }: { walletBalance: number; withdrawals: WithdrawalRow[]; onOpenWithdrawal: () => void }) {
  const settledWithdrawals = withdrawals.slice(0, 14).map((item) => Number(item.amount_ngn || 0));
  const chartValues = settledWithdrawals.length ? settledWithdrawals : [0];
  const max = Math.max(...chartValues, 1);
  return (
    <div className="grid gap-5">
      <Card className="bg-fleet-navy p-5 text-white">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-white/60">FastFleet owes you</p>
        <h2 className="mt-3 text-4xl font-black">{formatMoney(walletBalance)}</h2>
        <Button type="button" className="mt-5 bg-white text-fleet-navy hover:bg-white" onClick={onOpenWithdrawal}>Withdraw</Button>
      </Card>
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

function AccountTab({ profile, prefs, onPrefs }: { profile: RiderProfile; prefs: { jobs: boolean; payouts: boolean; sms: boolean }; onPrefs: (prefs: { jobs: boolean; payouts: boolean; sms: boolean }) => void }) {
  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-fleet-navy text-lg font-black text-white">{initials(profile.full_name || "Rider")}</span>
          <div><h2 className="text-xl font-black text-fleet-night">{profile.full_name || "Rider"}</h2><p className="text-sm font-semibold text-slate-500">{profile.phone || "No phone"} · {profile.lga || "Lagos"}</p></div>
        </div>
      </Card>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Vehicle details</h2><div className="mt-4 grid gap-3 text-sm font-bold text-slate-600"><Info label="Vehicle" value={profile.vehicle_type || "Motorcycle"} /><Info label="Plate" value={profile.plate_number || "Pending"} /><Info label="Colour" value={profile.vehicle_color || "Pending"} /></div><p className="mt-4 text-xs font-bold text-slate-500">Vehicle edits require re-submission.</p></Card>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">KYC document status</h2><div className="mt-4 grid gap-2">{["Government ID", "Driver's Licence", "Vehicle registration", "Insurance", "Guarantor letter"].map((item) => <div key={item} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3 text-sm font-black text-fleet-night"><span>{item}</span><StatusBadge tone="amber">Pending</StatusBadge></div>)}</div></Card>
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
