"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, Building2, Clock, CreditCard, FileText, Headphones, Home, MapPin, PackageCheck, Plus, Store, Truck, UserCog, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RoutePreview } from "@/components/maps/route-preview";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { WalletDashboardCard } from "@/components/wallet/wallet-dashboard-card";
import type { WalletKycStatus } from "@/lib/kyc";

type BusinessProfile = {
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  dispatch_volume: string | null;
  pickup_address: string | null;
  registration_status: string;
};

type DeliveryRow = {
  id?: string;
  delivery_code: string;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  price_ngn: number;
  eta_minutes: number;
  created_at: string;
};

type WalletRow = {
  balance_ngn: number;
  locked_balance_ngn: number;
};

const sampleProfile: BusinessProfile = {
  business_name: "FastFleet Vendor",
  contact_name: "Operations team",
  phone: "+234 800 000 0000",
  email: "ops@example.com",
  industry: "Retail and ecommerce",
  dispatch_volume: "10 - 30 weekly deliveries",
  pickup_address: "Lekki Phase 1, Lagos",
  registration_status: "submitted"
};

const sampleDeliveries: DeliveryRow[] = [
  {
    delivery_code: "FF-BIZ-901",
    pickup_address: "Lekki Phase 1",
    dropoff_address: "Victoria Island",
    status: "searching",
    price_ngn: 9600,
    eta_minutes: 28,
    created_at: new Date().toISOString()
  },
  {
    delivery_code: "FF-BIZ-877",
    pickup_address: "Lekki Phase 1",
    dropoff_address: "Ikeja GRA",
    status: "delivered",
    price_ngn: 13200,
    eta_minutes: 35,
    created_at: new Date(Date.now() - 86400000).toISOString()
  }
];

const businessMenuSections: Array<{
  title: string;
  items: Array<[string, string, LucideIcon, string | null]>;
}> = [
  {
    title: "Operations",
    items: [
      ["Overview", "Active orders, spend, delivery summary", Home, "Home"],
      ["New dispatch", "Book a delivery on behalf of business", Plus, null],
      ["Track orders", "Live status for all active deliveries", MapPin, "Live"],
      ["Order history", "All dispatches, status, recipients", Clock, null]
    ]
  },
  {
    title: "Finance",
    items: [
      ["Invoices & receipts", "Download records per delivery", FileText, null],
      ["Spend analytics", "Monthly delivery costs and trends", BarChart3, null]
    ]
  },
  {
    title: "Team & settings",
    items: [
      ["Team access", "Add staff who can book dispatches", UsersRound, null],
      ["Business profile", "Company name, address, contact", Building2, null],
      ["Notifications", "Alerts for dispatch and delivery updates", Bell, null],
      ["Support", "Business account help and billing", Headphones, null]
    ]
  }
];

export function BusinessDashboard() {
  const [profile, setProfile] = useState<BusinessProfile>(sampleProfile);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>(sampleDeliveries);
  const [wallet, setWallet] = useState<WalletRow>({ balance_ngn: 0, locked_balance_ngn: 0 });
  const [loading, setLoading] = useState(true);

  const stats = useMemo(() => {
    const active = deliveries.filter((delivery) => !["delivered", "cancelled"].includes(delivery.status)).length;
    const spend = deliveries.reduce((sum, delivery) => sum + Number(delivery.price_ngn || 0), 0);
    return { active, spend, total: deliveries.length };
  }, [deliveries]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) return;

        const [businessResult, deliveriesResult, walletResult] = await Promise.all([
          supabase
            .from("business_profiles")
            .select("business_name, contact_name, phone, email, industry, dispatch_volume, pickup_address, registration_status")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("deliveries")
            .select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, eta_minutes, created_at")
            .eq("customer_id", user.id)
            .order("created_at", { ascending: false })
            .limit(12),
          supabase.from("wallets").select("balance_ngn, locked_balance_ngn").eq("user_id", user.id).eq("wallet_type", "customer").maybeSingle()
        ]);

        if (!mounted) return;
        if (businessResult.data) setProfile(businessResult.data);
        if (deliveriesResult.data?.length) setDeliveries(deliveriesResult.data);
        if (walletResult.data) setWallet(walletResult.data);
      } catch {
        // Demo data keeps the dashboard useful before Supabase is connected.
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="section-wrap overflow-x-hidden py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">
                <Building2 className="h-4 w-4" />
                Business dashboard
              </span>
              <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Business Account Dashboard</h1>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
                {profile.business_name} dispatch tools for pickup addresses, bulk bookings, invoices, receipts, and support.
              </p>
            </div>
            <StatusBadge tone={profile.registration_status === "active" ? "green" : "amber"}>
              {profile.registration_status.replaceAll("_", " ")}
            </StatusBadge>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <LinkButton href="/book" className="w-full">
              <Plus className="h-4 w-4" />
              New delivery
            </LinkButton>
            <LinkButton href="/support" variant="secondary" className="w-full">
              Support
            </LinkButton>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Deliveries" value={String(stats.total)} helper="Business orders" />
          <StatTile label="Active" value={String(stats.active)} helper="Open dispatches" />
          <StatTile label="Spend" value={formatMoney(stats.spend)} helper="Delivery fees" />
          <StatTile label="Volume" value={profile.dispatch_volume?.split(" ")[0] || "10+"} helper="Weekly estimate" />
        </div>
      </div>

      <div id="wallet" className="mt-6 scroll-mt-24">
        <WalletDashboardCard
          userName={profile.contact_name || profile.business_name}
          walletType="customer"
          accountKind="business"
          balance={Number(wallet.balance_ngn || 0)}
          lockedBalance={Number(wallet.locked_balance_ngn || 0)}
          kycStatus={businessWalletStatus(profile.registration_status)}
          returnTo="/business/dashboard"
          onWithdraw={() => window.location.assign("/support?topic=business-withdrawal")}
          withdrawLabel="Withdraw"
          transactionHref="/business/dashboard#transactions"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Dispatch movement</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">Business live tracking</h2>
            </div>
            <StatusBadge tone="green">Realtime</StatusBadge>
          </div>
          <div className="mt-4">
            <RoutePreview
              label="Business route monitor"
              status={deliveries[0]?.status}
              riderName="Assigned courier"
              pickupAddress={deliveries[0]?.pickup_address || profile.pickup_address || "Victoria Island, Lagos"}
              dropoffAddress={deliveries[0]?.dropoff_address || "Ikeja GRA, Lagos"}
            />
          </div>
        </Card>

        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Business menu</span>
          <div className="mt-4 grid gap-3">
            {[
              ["Default pickup", profile.pickup_address || "Add a pickup point", Store],
              ["Team contact", profile.contact_name || profile.phone || "Add operations contact", UsersRound],
              ["Bulk dispatch", "Create repeat deliveries from saved addresses", Truck],
              ["Notifications", "Rider accepted, picked up, delivered", Bell],
              ["Documents", "Receipts and monthly reconciliation", FileText]
            ].map(([title, body, Icon]) => (
              <div key={String(title)} className="flex gap-3 rounded-fleet bg-fleet-paper p-3">
                <Icon className="mt-1 h-4 w-4 shrink-0 text-fleet-ember" />
                <span>
                  <strong className="block text-sm font-black text-fleet-night">{String(title)}</strong>
                  <span className="text-xs font-bold leading-5 text-slate-500">{String(body)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card id="transactions" className="mt-6 scroll-mt-24 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Transaction history</span>
            <h2 className="mt-1 text-2xl font-black text-fleet-night">Business wallet records</h2>
          </div>
          <CreditCard className="h-5 w-5 text-fleet-ember" />
        </div>
        <div className="mt-4 rounded-fleet bg-fleet-paper p-3 text-sm font-bold text-slate-600">
          Top-ups, prefunded deliveries, withdrawals, and receipts for this business wallet will appear here.
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Business menu</span>
            <h2 className="mt-1 text-2xl font-black text-fleet-night">Business workspace options</h2>
          </div>
          <UserCog className="h-5 w-5 text-fleet-ember" />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {businessMenuSections.map((section) => (
            <div key={section.title} className="rounded-fleet border border-fleet-line bg-white">
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
                    {tag ? <StatusBadge tone={tag === "Live" ? "amber" : "green"}>{tag}</StatusBadge> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Card id="profile" className="scroll-mt-24 p-5">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Saved pickup profile</span>
          <div className="mt-4 grid gap-3 text-sm font-bold text-slate-600">
            <Info label="Industry" value={profile.industry || "Not set"} />
            <Info label="Contact" value={profile.contact_name || profile.phone || "Not set"} />
            <Info label="Pickup" value={profile.pickup_address || "Not set"} />
          </div>
        </Card>

        <Card id="orders" className="scroll-mt-24 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Recent deliveries</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">Business orders</h2>
            </div>
            <Button type="button" size="sm" variant="secondary" disabled={loading}>
              Refresh
            </Button>
          </div>
          <div className="mt-4 grid gap-3">
            {deliveries.map((delivery) => (
              <article key={delivery.delivery_code} className="rounded-fleet border border-fleet-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="block text-sm font-black text-fleet-night">{delivery.delivery_code}</strong>
                    <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                      {delivery.pickup_address} to {delivery.dropoff_address}
                    </span>
                  </div>
                  <StatusBadge tone={delivery.status === "delivered" ? "green" : "amber"}>{delivery.status.replaceAll("_", " ")}</StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-black text-fleet-night">{formatMoney(delivery.price_ngn)}</span>
                  <LinkButton href={`/track?code=${delivery.delivery_code}`} size="sm" variant="secondary">
                    Track
                  </LinkButton>
                </div>
              </article>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function businessWalletStatus(status: string): WalletKycStatus {
  if (status === "active") return "verified";
  if (status === "rejected") return "more_info_needed";
  return "pending";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-fleet bg-fleet-paper p-3">
      <MapPin className="mt-1 h-4 w-4 shrink-0 text-fleet-ember" />
      <span>
        <span className="block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
        <strong className="block text-sm font-black text-fleet-night">{value}</strong>
      </span>
    </div>
  );
}
