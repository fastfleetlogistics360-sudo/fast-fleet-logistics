"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Clock, Download, FileText, Home, MapPin, PackageCheck, Plus, Upload, UserPlus, UserRound, WalletCards } from "lucide-react";
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

type BusinessTab = "overview" | "dispatch" | "history" | "team" | "account";

type BusinessProfile = {
  business_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  industry?: string | null;
  pickup_address?: string | null;
  cac_number?: string | null;
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
  { id: "team", label: "Team", icon: UserPlus },
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

function estimatePrice(form: DispatchForm) {
  const base = form.vehicleType === "Van" ? 7000 : form.vehicleType === "Car" ? 4500 : form.vehicleType === "Bike" ? 2500 : 3200;
  return base + Math.max(1800, (form.pickupAddress.length + form.dropoffAddress.length) * 65);
}

export function BusinessDashboard() {
  const [activeTab, setActiveTab] = useState<BusinessTab>("overview");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BusinessProfile>({ business_name: "FastFleet Business", contact_name: "Operations", phone: "+2348012345678" });
  const [walletBalance, setWalletBalance] = useState(0);
  const [orders, setOrders] = useState<DeliveryRow[]>([]);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [dispatch, setDispatch] = useState<DispatchForm>(defaultDispatch);
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [addressDraft, setAddressDraft] = useState({ label: "", address: "" });
  const [historyStatus, setHistoryStatus] = useState("all");
  const [teamEmail, setTeamEmail] = useState("");
  const [teamRole, setTeamRole] = useState<"dispatcher" | "viewer">("dispatcher");
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [prefs, setPrefs] = useState({ email: true, sms: true, wallet: true });

  const stats = useMemo(() => {
    const today = orders.filter((order) => new Date(order.created_at).toDateString() === new Date().toDateString()).length;
    const monthSpend = orders.reduce((sum, order) => sum + Number(order.price_ngn || 0), 0);
    const active = orders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length;
    return { today, monthSpend, active, addresses: addresses.length };
  }, [addresses.length, orders]);
  const filteredOrders = historyStatus === "all" ? orders : orders.filter((order) => order.status === historyStatus);

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

        const [businessResult, walletResult, ordersResult, addressResult, teamResult] = await Promise.all([
          supabase.from("business_profiles").select("business_name, contact_name, phone, email, industry, pickup_address, cac_number").eq("user_id", user.id).maybeSingle(),
          supabase.from("wallets").select("balance_ngn").eq("user_id", user.id).maybeSingle(),
          supabase.from("deliveries").select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, created_at, proof_url").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(50),
          supabase.from("saved_addresses").select("id, label, address").eq("user_id", user.id).order("created_at", { ascending: false }),
          fetch("/api/business/team").then((response) => response.json()).catch(() => ({ members: [] }))
        ]);
        if (!mounted) return;
        const nextProfile = (businessResult.data || profile) as BusinessProfile;
        setProfile(nextProfile);
        setWalletBalance(Number((walletResult.data as { balance_ngn?: number } | null)?.balance_ngn || 0));
        if (ordersResult.error) throw ordersResult.error;
        setOrders((ordersResult.data || []) as DeliveryRow[]);
        setAddresses((addressResult.data || []) as SavedAddress[]);
        setTeam((teamResult.members || []) as TeamMember[]);
        setDispatch((current) => ({
          ...current,
          senderName: nextProfile.contact_name || "",
          senderPhone: nextProfile.phone || "",
          pickupAddress: nextProfile.pickup_address || ""
        }));
      } catch (error) {
        if (mounted) setDispatchMessage(error instanceof Error ? error.message : "Could not load business dashboard.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

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
    <section className="min-h-screen bg-fleet-paper pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[260px_1fr]">
        <DesktopNav activeTab={activeTab} onChange={setActiveTab} />
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:py-8">
          <header className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-fleet-night sm:text-4xl">{profile.business_name || "Business dashboard"}</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">Dispatch, history, team, wallet, and account controls.</p>
            </div>
            <NotificationBell />
          </header>
          {activeTab === "overview" ? <OverviewTab loading={loading} profile={profile} walletBalance={walletBalance} stats={stats} orders={orders} /> : null}
          {activeTab === "dispatch" ? <DispatchTab dispatch={dispatch} onDispatch={setDispatch} estimate={estimatePrice(dispatch)} loading={dispatchLoading} message={dispatchMessage} onSubmit={submitDispatch} addresses={addresses} bulkRows={bulkRows} onCsv={parseCsv} onDownloadTemplate={downloadTemplate} onDispatchBulk={dispatchBulk} addressDraft={addressDraft} onAddressDraft={setAddressDraft} onAddAddress={addAddress} onDeleteAddress={(id) => setAddresses((current) => current.filter((item) => item.id !== id))} /> : null}
          {activeTab === "history" ? <HistoryTab orders={filteredOrders} status={historyStatus} onStatus={setHistoryStatus} onExport={exportHistory} /> : null}
          {activeTab === "team" ? <TeamTab team={team} email={teamEmail} role={teamRole} message={teamMessage} onEmail={setTeamEmail} onRole={setTeamRole} onInvite={inviteTeamMember} onRemove={removeTeamMember} /> : null}
          {activeTab === "account" ? <AccountTab profile={profile} onProfile={setProfile} prefs={prefs} onPrefs={setPrefs} /> : null}
        </main>
      </div>
      <MobileTabs activeTab={activeTab} onChange={setActiveTab} />
    </section>
  );
}

function DesktopNav({ activeTab, onChange }: { activeTab: BusinessTab; onChange: (tab: BusinessTab) => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen border-r border-fleet-line bg-white p-4 lg:block">
      <div className="rounded-fleet bg-fleet-navy p-4 text-white"><span className="text-xl font-black">FastFleet</span><p className="mt-1 text-xs font-semibold text-white/70">Business app</p></div>
      <nav className="mt-5 grid gap-2">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn("flex items-center gap-3 rounded-fleet px-3 py-3 text-sm font-black", activeTab === tab.id ? "bg-fleet-navy text-white" : "text-slate-600 hover:bg-fleet-paper")}><Icon className="h-4 w-4" />{tab.label}</button>; })}</nav>
    </aside>
  );
}

function MobileTabs({ activeTab, onChange }: { activeTab: BusinessTab; onChange: (tab: BusinessTab) => void }) {
  return <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-fleet border border-fleet-line bg-white/95 p-1 shadow-glow backdrop-blur lg:hidden">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn("grid min-h-14 place-items-center rounded-fleet text-[0.62rem] font-black", activeTab === tab.id ? "bg-fleet-navy text-white" : "text-slate-500")}><Icon className="h-4 w-4" />{tab.label}</button>; })}</nav>;
}

function OverviewTab({ loading, profile, walletBalance, stats, orders }: { loading: boolean; profile: BusinessProfile; walletBalance: number; stats: { today: number; monthSpend: number; active: number; addresses: number }; orders: DeliveryRow[] }) {
  if (loading) return <DashboardSkeleton />;
  return (
    <div className="grid gap-5">
      <Card className="p-5"><div className="flex items-center gap-4"><span className="grid h-16 w-16 place-items-center rounded-fleet bg-fleet-navy text-lg font-black text-white">{initials(profile.business_name || "Business")}</span><div><h2 className="text-xl font-black text-fleet-night">{profile.business_name || "Business"}</h2><p className="text-sm font-semibold text-slate-500">Logo and business name editable in Account</p></div></div></Card>
      <Card className="bg-fleet-navy p-5 text-white"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/60">Wallet balance</p><h2 className="mt-3 text-4xl font-black">{formatMoney(walletBalance)}</h2><LinkButton href="/wallet/callback" className="mt-5 bg-white text-fleet-navy hover:bg-white">Top up</LinkButton></Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Orders today" value={String(stats.today)} /><Stat label="Spent this month" value={formatMoney(stats.monthSpend)} /><Stat label="Active" value={String(stats.active)} /><Stat label="Saved addresses" value={String(stats.addresses)} /></div>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Recent orders</h2><div className="mt-4 grid gap-3">{orders.slice(0, 5).map((order) => <OrderCard key={order.id} order={order} />)}</div></Card>
    </div>
  );
}

function DispatchTab({ dispatch, onDispatch, estimate, loading, message, onSubmit, addresses, bulkRows, onCsv, onDownloadTemplate, onDispatchBulk, addressDraft, onAddressDraft, onAddAddress, onDeleteAddress }: { dispatch: DispatchForm; onDispatch: (form: DispatchForm) => void; estimate: number; loading: boolean; message: string | null; onSubmit: () => void; addresses: SavedAddress[]; bulkRows: BulkRow[]; onCsv: (text: string) => void; onDownloadTemplate: () => void; onDispatchBulk: () => void; addressDraft: { label: string; address: string }; onAddressDraft: (draft: { label: string; address: string }) => void; onAddAddress: () => void; onDeleteAddress: (id: string) => void }) {
  return (
    <div className="grid gap-5">
        <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Single dispatch</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Sender name" value={dispatch.senderName} onChange={(value) => onDispatch({ ...dispatch, senderName: value })} /><Field label="Sender phone" value={dispatch.senderPhone} onChange={(value) => onDispatch({ ...dispatch, senderPhone: value })} /><AddressField label="Pickup address" value={dispatch.pickupAddress} addresses={addresses} onChange={(value) => onDispatch({ ...dispatch, pickupAddress: value })} /><Field label="Recipient name" value={dispatch.recipientName} onChange={(value) => onDispatch({ ...dispatch, recipientName: value })} /><Field label="Recipient phone" value={dispatch.recipientPhone} onChange={(value) => onDispatch({ ...dispatch, recipientPhone: value })} /><AddressField label="Drop-off address" value={dispatch.dropoffAddress} addresses={addresses} onChange={(value) => onDispatch({ ...dispatch, dropoffAddress: value })} /><Select label="Package type" value={dispatch.packageType} values={["Parcel", "Documents", "Food", "Electronics"]} onChange={(value) => onDispatch({ ...dispatch, packageType: value })} /><Select label="Vehicle" value={dispatch.vehicleType} values={["Any", "Bike", "Car", "Van"]} onChange={(value) => onDispatch({ ...dispatch, vehicleType: value })} /><Select label="Scheduling" value={dispatch.scheduleMode} values={["Now", "Schedule for later"]} onChange={(value) => onDispatch({ ...dispatch, scheduleMode: value })} />{dispatch.scheduleMode === "Schedule for later" ? <Field label="Date and time" value={dispatch.scheduledAt} onChange={(value) => onDispatch({ ...dispatch, scheduledAt: value })} /> : null}<Select label="Payment" value={dispatch.payment} values={["wallet"]} onChange={(value) => onDispatch({ ...dispatch, payment: value })} /><label className="form-field sm:col-span-2"><span className="form-label">Special instructions</span><textarea className="form-textarea" value={dispatch.instructions} onChange={(event) => onDispatch({ ...dispatch, instructions: event.target.value })} /></label></div><div className="mt-5 rounded-fleet bg-fleet-paper p-4 text-sm font-black text-fleet-night">Estimated price: {formatMoney(estimate)}</div>{message ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}<Button type="button" disabled={loading} className="mt-5 w-full bg-fleet-navy hover:bg-fleet-night" onClick={onSubmit}>{loading ? "Creating..." : "Confirm dispatch"}</Button></Card>
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

function AccountTab({ profile, onProfile, prefs, onPrefs }: { profile: BusinessProfile; onProfile: (profile: BusinessProfile) => void; prefs: { email: boolean; sms: boolean; wallet: boolean }; onPrefs: (prefs: { email: boolean; sms: boolean; wallet: boolean }) => void }) {
  return <div className="grid gap-5"><Card className="p-5"><div className="flex items-center gap-4"><span className="grid h-16 w-16 place-items-center rounded-fleet bg-fleet-navy text-lg font-black text-white">{initials(profile.business_name || "Business")}</span><div><h2 className="text-xl font-black text-fleet-night">{profile.business_name || "Business"}</h2><p className="text-sm font-semibold text-slate-500">{profile.industry || "Industry not set"}</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Business name" value={profile.business_name || ""} onChange={(value) => onProfile({ ...profile, business_name: value })} /><Field label="Address" value={profile.pickup_address || ""} onChange={(value) => onProfile({ ...profile, pickup_address: value })} /><Field label="CAC number" value={profile.cac_number || ""} onChange={(value) => onProfile({ ...profile, cac_number: value })} /><Field label="Industry" value={profile.industry || ""} onChange={(value) => onProfile({ ...profile, industry: value })} /><Field label="Contact person" value={profile.contact_name || ""} onChange={(value) => onProfile({ ...profile, contact_name: value })} /><Field label="Contact phone" value={profile.phone || ""} onChange={(value) => onProfile({ ...profile, phone: value })} /></div></Card><Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Notification preferences</h2><div className="mt-4 grid gap-3">{(["email", "sms", "wallet"] as const).map((key) => <label key={key} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3 text-sm font-black capitalize text-fleet-night">{key}<input type="checkbox" className="h-5 w-5 accent-fleet-navy" checked={prefs[key]} onChange={(event) => onPrefs({ ...prefs, [key]: event.target.checked })} /></label>)}</div></Card><Card className="p-5"><AccountDeletionButton /><Button type="button" variant="secondary" className="mt-3 w-full" onClick={async () => { const supabase = createClient(); await supabase.auth.signOut(); window.location.assign("/auth"); }}>Sign out</Button></Card></div>;
}

function OrderCard({ order, detail }: { order: DeliveryRow; detail?: boolean }) {
  return <article className="rounded-fleet border border-fleet-line bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-500">{formatDateTime(order.created_at)}</p><h3 className="mt-1 text-sm font-black text-fleet-night">{order.delivery_code}</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{order.pickup_address} to {order.dropoff_address}</p></div><StatusBadge tone={order.status === "delivered" ? "green" : "amber"}>{order.status.replaceAll("_", " ")}</StatusBadge></div><div className="mt-3 flex items-center justify-between"><strong className="text-sm font-black text-fleet-night">{formatMoney(order.price_ngn)}</strong><LinkButton href={`/track?code=${order.delivery_code}`} size="sm" variant="secondary">{detail ? "View details" : "Track"}</LinkButton></div>{detail ? <div className="mt-3 rounded-fleet bg-fleet-paper p-3 text-xs font-bold text-slate-500">Timeline: Booked to Rider assigned to Picked up to Delivered. Proof of delivery appears here when uploaded.</div> : null}</article>;
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
