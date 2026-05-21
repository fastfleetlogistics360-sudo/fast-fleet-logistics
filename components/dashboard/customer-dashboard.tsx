"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CreditCard,
  Flag,
  Headphones,
  Home,
  MapPin,
  PackageCheck,
  PlayCircle,
  Settings,
  ShieldCheck,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { isLaunchState, launchStateLabel, localLiveStates, normalizeState } from "@/lib/launch-states";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { RoutePreview } from "@/components/maps/route-preview";
import { WalletDashboardCard } from "@/components/wallet/wallet-dashboard-card";
import { JoinStateWaitlistButton } from "@/components/waitlist/join-state-waitlist-button";

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

type ProfileRow = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  default_zone?: string | null;
};

type WalletRow = {
  balance_ngn: number;
  locked_balance_ngn: number;
};

type TransactionRow = {
  id?: string;
  transaction_type: string;
  amount_ngn: number;
  status: string;
  provider?: string | null;
  provider_reference?: string | null;
  created_at?: string;
};

const sampleDeliveries: DeliveryRow[] = [
  {
    delivery_code: "FF-240911",
    pickup_address: "Victoria Island, Lagos",
    dropoff_address: "Ikeja GRA, Lagos",
    status: "in_transit",
    price_ngn: 10850,
    eta_minutes: 22,
    created_at: new Date().toISOString()
  },
  {
    delivery_code: "FF-240821",
    pickup_address: "Ota, Ogun",
    dropoff_address: "Abeokuta, Ogun",
    status: "delivered",
    price_ngn: 18600,
    eta_minutes: 41,
    created_at: new Date(Date.now() - 86400000).toISOString()
  }
];

function localDeliveryRows(): DeliveryRow[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(localStorage.getItem("fastfleet.next.deliveries") || "[]") as Array<Record<string, unknown>>;
    return stored
      .map((item) => ({
        delivery_code: String(item.delivery_code || ""),
        pickup_address: String(item.pickup_address || item.pickup || item.store || "Marketplace checkout"),
        dropoff_address: String(item.dropoff_address || item.dropoff || item.address || "Customer delivery address"),
        status: String(item.status || "pending_payment"),
        price_ngn: Number(item.price_ngn || item.total || 0),
        eta_minutes: Number(item.eta_minutes || item.estimate_eta_minutes || 35),
        created_at: String(item.created_at || new Date().toISOString())
      }))
      .filter((item) => item.delivery_code);
  } catch {
    return [];
  }
}

function mergeDeliveryRows(rows: DeliveryRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.delivery_code)) return false;
    seen.add(row.delivery_code);
    return true;
  });
}

const tools: Array<[string, string, LucideIcon]> = [
  ["Saved addresses", "Home, office, warehouse, and vendor pickup points", Home],
  ["Wallet records", "Funding, refunds, receipts, and delivery charges", Wallet],
  ["Payment history", "Cards, transfers, invoices, and Paystack references", CreditCard],
  ["Support center", "Ticket updates and delivery escalations", Headphones],
  ["Notifications", "Rider arrived, accepted, delivered, and payout updates", Bell],
  ["Profile settings", "Phone, email, launch state, and account preferences", Settings]
];

export function CustomerDashboard() {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [profile, setProfile] = useState<ProfileRow>({ default_zone: "Lagos" });
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [liveStates, setLiveStates] = useState<string[]>(localLiveStates());

  const selectedState = normalizeState(profile.default_zone) || "Lagos";
  const launchReady = isLaunchState(selectedState, liveStates);
  const activeDelivery = deliveries.find((delivery) => !["delivered", "cancelled"].includes(delivery.status)) || deliveries[0];
  const firstName = (profile.full_name || profile.email || "there").trim().split(/\s+/)[0] || "there";

  const stats = useMemo(() => {
    const active = deliveries.filter((delivery) => !["delivered", "cancelled"].includes(delivery.status)).length;
    const spend = deliveries.reduce((sum, delivery) => sum + Number(delivery.price_ngn || 0), 0);
    return { active, spend, total: deliveries.length };
  }, [deliveries]);

  useEffect(() => {
    let mounted = true;
    let channelCleanup: (() => void) | undefined;

    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user) {
          if (mounted) {
            const localDeliveries = localDeliveryRows();
            setDeliveries(localDeliveries.length ? localDeliveries : sampleDeliveries);
            setProfile({ default_zone: "Lagos" });
            setWallet({ balance_ngn: 54500, locked_balance_ngn: 0 });
          }
          return;
        }

        const [profileResult, deliveriesResult, walletResult] = await Promise.all([
          supabase.from("users").select("full_name, email, phone, default_zone").eq("id", user.id).maybeSingle(),
          supabase
            .from("deliveries")
            .select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, eta_minutes, created_at")
            .eq("customer_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase.from("wallets").select("id, balance_ngn, locked_balance_ngn").eq("user_id", user.id).eq("wallet_type", "customer").maybeSingle()
        ]);

        if (!mounted) return;

        setProfile(profileResult.data || { default_zone: "Lagos", email: user.email, phone: user.phone });
        const mergedDeliveries = mergeDeliveryRows([...(deliveriesResult.data || []), ...localDeliveryRows()]);
        setDeliveries(mergedDeliveries.length ? mergedDeliveries : sampleDeliveries);
        setWallet(walletResult.data || { balance_ngn: 0, locked_balance_ngn: 0 });

        const launchResult = await supabase.from("platform_launch_states").select("state, status").eq("status", "live");
        if (mounted && launchResult.data?.length) {
          setLiveStates(Array.from(new Set([...localLiveStates(), ...launchResult.data.map((row) => row.state)])));
        }

        if (walletResult.data?.id) {
          const transactionResult = await supabase
            .from("transactions")
            .select("id, transaction_type, amount_ngn, status, provider, provider_reference, created_at")
            .eq("wallet_id", walletResult.data.id)
            .order("created_at", { ascending: false })
            .limit(12);
          if (mounted) setTransactions(transactionResult.data || []);
        }

        if (!channelCleanup) {
          const channel = supabase
            .channel(`customer-deliveries:${user.id}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "deliveries", filter: `customer_id=eq.${user.id}` },
              () => load()
            )
            .subscribe();

          channelCleanup = () => {
            supabase.removeChannel(channel);
          };
        }
      } catch {
        if (mounted) {
          const localDeliveries = localDeliveryRows();
          setDeliveries(localDeliveries.length ? localDeliveries : sampleDeliveries);
          setWallet({ balance_ngn: 54500, locked_balance_ngn: 0 });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
      channelCleanup?.();
    };
  }, []);

  async function updateDeliveryStatus(delivery: DeliveryRow, status: "picked_up" | "delivered") {
    setUpdating(`${delivery.delivery_code}-${status}`);
    const timestamp = new Date().toISOString();
    setDeliveries((current) =>
      current.map((item) => (item.delivery_code === delivery.delivery_code ? { ...item, status } : item))
    );

    try {
      if (!delivery.id) return;
      const supabase = createClient();
      const updatePayload =
        status === "picked_up"
          ? { status, picked_up_at: timestamp }
          : { status, delivered_at: timestamp };
      await supabase
        .from("deliveries")
        .update(updatePayload)
        .eq("id", delivery.id);
    } finally {
      setUpdating(null);
    }
  }

  if (!loading && !launchReady) {
    return <ComingSoonDashboard state={selectedState} profile={profile} liveStates={liveStates} />;
  }

  return (
    <section className="section-wrap py-8 sm:py-12">
      <div className="grid gap-5">
        <Card className="overflow-hidden border-fleet-gold/40 bg-white/95 shadow-lift">
          <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center lg:p-5">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">
                <ShieldCheck className="h-4 w-4" />
                Customer dashboard
              </span>
              <h1 className="mt-3 text-3xl font-black leading-tight text-fleet-night sm:text-4xl">Hi, <span className="text-fleet-ember">{firstName}</span>.</h1>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-600">Wallet, orders, and delivery updates without the clutter.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[320px]">
              <LinkButton href="/book" className="w-full">
                Book delivery
              </LinkButton>
              <LinkButton href={activeDelivery ? `/track?code=${activeDelivery.delivery_code}` : "/track"} variant="secondary" className="w-full">
                Track live movement
              </LinkButton>
            </div>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Wallet balance" value={formatMoney(Number(wallet?.balance_ngn || 0))} helper="Tap top up below" />
          <StatTile label="Orders" value={String(stats.total)} helper="Delivery history" />
          <StatTile label="Active" value={String(stats.active)} helper="Open jobs" />
          <StatTile label="Spend" value={formatMoney(stats.spend)} helper="Delivery fees" />
        </div>
      </div>

      <div id="wallet" className="mt-6 scroll-mt-24">
        <WalletDashboardCard
          userName={firstName}
          walletType="customer"
          balance={Number(wallet?.balance_ngn || 0)}
          lockedBalance={Number(wallet?.locked_balance_ngn || 0)}
          kycStatus="verified"
          returnTo="/dashboard"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Live tracking</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">Dispatch movement</h2>
            </div>
            <StatusBadge tone="green">Realtime</StatusBadge>
          </div>
          <div className="mt-4">
            <RoutePreview
              label="Rider moving live"
              status={activeDelivery?.status}
              pickupAddress={activeDelivery?.pickup_address || "Victoria Island, Lagos"}
              dropoffAddress={activeDelivery?.dropoff_address || "Ikeja GRA, Lagos"}
            />
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Orders</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">Delivery history</h2>
            </div>
            <LinkButton href="/book" size="sm" variant="secondary">
              New
            </LinkButton>
          </div>
          <div className="mt-4 grid gap-3">
            {loading ? (
              <>
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </>
            ) : (
              deliveries.map((delivery) => (
                <DeliveryCard key={delivery.delivery_code} delivery={delivery} updating={updating} onUpdateStatus={updateDeliveryStatus} />
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tools.map(([title, body, Icon]) => (
          <Card key={title} className="p-5 transition hover:-translate-y-1 hover:shadow-lift">
            <Icon className="h-5 w-5 text-fleet-ember" />
            <h3 className="mt-4 text-lg font-black text-fleet-night">{title}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
          </Card>
        ))}
      </div>

      <div id="addresses" className="mt-6 grid scroll-mt-24 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Saved addresses</span>
          <div className="mt-4 grid gap-3">
            {["Home: Chevron Drive, Lekki", "Office: Marina, Lagos Island", "Warehouse: Ota, Ogun State"].map((address) => (
              <div key={address} className="flex items-center gap-3 rounded-fleet bg-fleet-paper p-3">
                <MapPin className="h-4 w-4 text-fleet-ember" />
                <span className="text-sm font-bold text-fleet-night">{address}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Delivery confidence</span>
          <div className="mt-4 grid gap-3">
            {["Rider identity verified before pickup", "Start and end trip audit trail", "Realtime status visible to customer and admin"].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-fleet bg-fleet-paper p-3">
                <PackageCheck className="h-4 w-4 text-fleet-leaf" />
                <span className="text-sm font-bold text-fleet-night">{item}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function ComingSoonDashboard({ state, profile, liveStates }: { state: string; profile: ProfileRow; liveStates: string[] }) {
  return (
    <section className="section-wrap py-10 sm:py-14">
      <Card className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1fr_0.9fr]">
          <div className="p-6 sm:p-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-amber-700">
              <Bell className="h-4 w-4" />
              Launch waitlist
            </span>
            <h1 className="mt-5 text-4xl font-black leading-tight text-fleet-night sm:text-6xl">COMING SOON TO YOUR STATE</h1>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
              FastFleet is live in {launchStateLabel(liveStates)}. Your {state} account is ready, and we can notify you as soon as your state opens.
            </p>
            <div className="mt-7">
              <JoinStateWaitlistButton state={state} email={profile.email} phone={profile.phone} />
            </div>
          </div>
          <div className="min-h-[360px] bg-fleet-night p-4">
            <RoutePreview className="h-full min-h-[330px]" label={`${state} launch route`} status="searching" />
          </div>
        </div>
      </Card>
    </section>
  );
}

function DeliveryCard({
  delivery,
  updating,
  onUpdateStatus
}: {
  delivery: DeliveryRow;
  updating: string | null;
  onUpdateStatus: (delivery: DeliveryRow, status: "picked_up" | "delivered") => void;
}) {
  const tone: "green" | "red" | "amber" = delivery.status === "delivered" ? "green" : delivery.status === "cancelled" ? "red" : "amber";
  const completed = delivery.status === "delivered";

  return (
    <article className="rounded-fleet border border-fleet-line bg-white p-4 shadow-[0_10px_22px_rgba(8,17,31,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="block font-black text-fleet-night">{delivery.delivery_code}</strong>
          <span className="text-xs font-bold text-slate-500">{formatDateTime(delivery.created_at)}</span>
        </div>
        <StatusBadge tone={tone}>{delivery.status.replaceAll("_", " ")}</StatusBadge>
      </div>
      <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600">
        <span>{delivery.pickup_address}</span>
        <span>{delivery.dropoff_address}</span>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <strong className="text-fleet-night">{formatMoney(delivery.price_ngn)}</strong>
        <LinkButton href={`/track?code=${delivery.delivery_code}`} size="sm" variant="secondary">
          Track
        </LinkButton>
      </div>
      {!completed ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={updating === `${delivery.delivery_code}-picked_up`}
            onClick={() => onUpdateStatus(delivery, "picked_up")}
          >
            <PlayCircle className="h-4 w-4" />
            Start trip
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={updating === `${delivery.delivery_code}-delivered`}
            onClick={() => onUpdateStatus(delivery, "delivered")}
          >
            <Flag className="h-4 w-4" />
            End trip
          </Button>
        </div>
      ) : null}
    </article>
  );
}
