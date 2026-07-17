import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { RiderAccountType } from "@/lib/rider-account-type";
import { parseSelfServiceRole, parseUserRole, roleHome } from "@/lib/auth/roles";
import { publicTrackingHref } from "@/lib/tracking-links";
import { LiveOrderTracking, type DeliveryLocation, type TrackingOrder } from "@/components/tracking/live-order-tracking";

export type AccountOrderViewMode = "tracking" | "messenger";

const deliverySelectWithRiderTag =
  "id, delivery_code, pickup_address, pickup_latitude, pickup_longitude, dropoff_address, dropoff_latitude, dropoff_longitude, status, price_ngn, distance_km, eta_minutes, created_at, updated_at, metadata, rider_id, rider_profiles:rider_profiles!deliveries_rider_id_fkey(plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, email, avatar_url))";

const deliverySelectWithoutRiderTag =
  "id, delivery_code, pickup_address, pickup_latitude, pickup_longitude, dropoff_address, dropoff_latitude, dropoff_longitude, status, price_ngn, distance_km, eta_minutes, created_at, updated_at, metadata, rider_id, rider_profiles:rider_profiles!deliveries_rider_id_fkey(plate_number, vehicle_type, vehicle_color, users:users!rider_profiles_user_id_fkey(full_name, phone, email, avatar_url))";

const marketplaceOrderSelect =
  "id, order_code, customer_id, delivery_id, marketplace_kind, items, pickup_address, dropoff_address, status, amount, distance_km, eta_minutes, created_at, updated_at";

type DeliveryRow = {
  id: string;
  delivery_code: string;
  pickup_address: string;
  pickup_latitude?: number | string | null;
  pickup_longitude?: number | string | null;
  dropoff_address: string;
  dropoff_latitude?: number | string | null;
  dropoff_longitude?: number | string | null;
  status: string;
  price_ngn: number | string;
  distance_km?: number | string | null;
  eta_minutes?: number | string | null;
  created_at: string;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
  rider_id?: string | null;
  rider_profiles?: {
    plate_number?: string | null;
    vehicle_type?: string | null;
    vehicle_color?: string | null;
    rider_account_type?: RiderAccountType | null;
    users?: {
      full_name?: string | null;
      phone?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    } | null;
  } | null;
};

type MarketplaceOrderRow = {
  id: string;
  order_code?: string | null;
  customer_id?: string | null;
  delivery_id?: string | null;
  marketplace_kind?: string | null;
  items?: Array<{ name?: string; productName?: string; quantity?: number; store?: string; vendorName?: string }> | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  status?: string | null;
  amount?: number | string | null;
  distance_km?: number | string | null;
  eta_minutes?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RiderProfileRow = NonNullable<DeliveryRow["rider_profiles"]>;

export async function AccountOrderPage({ params, mode }: { params: Promise<{ orderId: string }>; mode: AccountOrderViewMode }) {
  const { orderId } = await params;
  const lookup = decodeURIComponent(orderId).trim();
  if (!lookup) notFound();

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect(`/auth?returnTo=/account/orders/${encodeURIComponent(lookup)}/${mode}`);

  const admin = createAdminClient();
  const db = admin || supabase;
  const { data: accountProfile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("user_id", user.id)
    .maybeSingle<{ account_type?: string | null }>();
  const role = parseUserRole(accountProfile?.account_type) || parseSelfServiceRole(user.user_metadata?.account_type || user.user_metadata?.role) || "customer";
  const backHref = roleHome[role];

  const directDelivery = await loadDirectDelivery(db, lookup, user.id);
  if (directDelivery) {
    const order = await toTrackingOrder(directDelivery);
    const location = await loadLocation(db, directDelivery.id);
    return <LiveOrderTracking initialOrder={order} initialLocation={location} mode={mode} backHref={backHref} />;
  }

  const marketplaceOrder = await loadMarketplaceOrder(db, lookup, user.id);
  if (!marketplaceOrder) redirect(publicTrackingHref(lookup));

  const linkedDelivery = marketplaceOrder.delivery_id ? await loadLinkedDelivery(db, marketplaceOrder.delivery_id) : null;
  if (linkedDelivery) {
    const order = await toTrackingOrder(linkedDelivery, marketplaceOrder);
    const location = await loadLocation(db, linkedDelivery.id);
    return <LiveOrderTracking initialOrder={order} initialLocation={location} mode={mode} backHref={backHref} />;
  }

  return <LiveOrderTracking initialOrder={toMarketplaceTrackingOrder(marketplaceOrder)} initialLocation={null} mode={mode} backHref={backHref} />;
}

async function loadDirectDelivery(db: SupabaseClient, lookup: string, userId: string) {
  const query = db.from("deliveries").select(deliverySelectWithRiderTag).eq("customer_id", userId);
  const result = isUuid(lookup)
    ? await query.eq("id", lookup).maybeSingle<DeliveryRow>()
    : await query.eq("delivery_code", lookup.toUpperCase()).maybeSingle<DeliveryRow>();
  if (result.error && /rider_account_type/i.test(result.error.message)) {
    return loadDirectDeliveryWithoutRiderTag(db, lookup, userId);
  }
  if (result.error) return null;
  return result.data || null;
}

async function loadDirectDeliveryWithoutRiderTag(db: SupabaseClient, lookup: string, userId: string) {
  const query = db.from("deliveries").select(deliverySelectWithoutRiderTag).eq("customer_id", userId);
  const result = isUuid(lookup)
    ? await query.eq("id", lookup).maybeSingle<DeliveryRow>()
    : await query.eq("delivery_code", lookup.toUpperCase()).maybeSingle<DeliveryRow>();
  if (result.error) return null;
  return result.data || null;
}

async function loadMarketplaceOrder(db: SupabaseClient, lookup: string, userId: string) {
  const query = db.from("orders").select(marketplaceOrderSelect).eq("customer_id", userId);
  const result = isUuid(lookup)
    ? await query.eq("id", lookup).maybeSingle<MarketplaceOrderRow>()
    : await query.eq("order_code", lookup.toUpperCase()).maybeSingle<MarketplaceOrderRow>();
  if (result.error) return null;
  return result.data || null;
}

async function loadLinkedDelivery(db: SupabaseClient, deliveryId: string) {
  const { data, error } = await db.from("deliveries").select(deliverySelectWithRiderTag).eq("id", deliveryId).maybeSingle<DeliveryRow>();
  if (error && /rider_account_type/i.test(error.message)) return loadLinkedDeliveryWithoutRiderTag(db, deliveryId);
  if (error) return null;
  return data || null;
}

async function loadLinkedDeliveryWithoutRiderTag(db: SupabaseClient, deliveryId: string) {
  const { data, error } = await db.from("deliveries").select(deliverySelectWithoutRiderTag).eq("id", deliveryId).maybeSingle<DeliveryRow>();
  if (error) return null;
  return data || null;
}

async function loadLocation(db: SupabaseClient, deliveryId: string) {
  const { data } = await db
    .from("delivery_locations")
    .select("id, order_id, rider_id, latitude, longitude, heading, speed, status, created_at, updated_at")
    .eq("order_id", deliveryId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<DeliveryLocation>();
  return data || null;
}

async function toTrackingOrder(delivery: DeliveryRow, marketplaceOrder?: MarketplaceOrderRow | null): Promise<TrackingOrder> {
  let riderProfile = delivery.rider_profiles;
  if (delivery.rider_id && !riderProfile?.users?.full_name) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin
        .from("rider_profiles")
        .select("plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, email, avatar_url)")
        .eq("id", delivery.rider_id)
        .maybeSingle<RiderProfileRow>();
      riderProfile = data || riderProfile;
    }
  }

  return {
    id: delivery.id,
    delivery_code: delivery.delivery_code,
    tracking_kind: "delivery",
    pickup_address: delivery.pickup_address,
    pickup_latitude: toNumberOrNull(delivery.pickup_latitude),
    pickup_longitude: toNumberOrNull(delivery.pickup_longitude),
    dropoff_address: delivery.dropoff_address,
    dropoff_latitude: toNumberOrNull(delivery.dropoff_latitude),
    dropoff_longitude: toNumberOrNull(delivery.dropoff_longitude),
    status: delivery.status,
    price_ngn: Number(delivery.price_ngn || 0),
    distance_km: toNumberOrNull(delivery.distance_km),
    eta_minutes: toNumberOrNull(delivery.eta_minutes),
    created_at: delivery.created_at,
    updated_at: delivery.updated_at,
    metadata: delivery.metadata || null,
    rider_id: delivery.rider_id,
    marketplace_order: marketplaceOrder ? marketplaceTrackingFields(marketplaceOrder) : null,
    rider: {
      full_name: riderProfile?.users?.full_name || null,
      phone: riderProfile?.users?.phone || null,
      email: riderProfile?.users?.email || null,
      avatar_url: riderProfile?.users?.avatar_url || null,
      vehicle_type: riderProfile?.vehicle_type || null,
      plate_number: riderProfile?.plate_number || null,
      vehicle_color: riderProfile?.vehicle_color || null,
      rider_account_type: riderProfile?.rider_account_type || null
    }
  };
}

function toMarketplaceTrackingOrder(order: MarketplaceOrderRow): TrackingOrder {
  return {
    id: order.id,
    delivery_code: String(order.order_code || order.id).toUpperCase(),
    tracking_kind: "marketplace_order",
    pickup_address: order.pickup_address || "Marketplace pickup",
    dropoff_address: order.dropoff_address || "Customer delivery address",
    status: order.status || "received",
    price_ngn: Number(order.amount || 0),
    distance_km: toNumberOrNull(order.distance_km),
    eta_minutes: toNumberOrNull(order.eta_minutes),
    created_at: order.created_at || new Date().toISOString(),
    updated_at: order.updated_at,
    metadata: {
      source: "business_marketplace_order",
      business_order_id: order.id,
      marketplace_kind: order.marketplace_kind || null
    },
    rider_id: null,
    marketplace_order: marketplaceTrackingFields(order),
    rider: null
  };
}

function marketplaceTrackingFields(order: MarketplaceOrderRow): NonNullable<TrackingOrder["marketplace_order"]> {
  return {
    id: order.id,
    order_code: order.order_code || null,
    status: order.status || "received",
    delivery_id: order.delivery_id || null,
    marketplace_kind: order.marketplace_kind || null,
    items: Array.isArray(order.items) ? order.items : [],
    created_at: order.created_at || null,
    updated_at: order.updated_at || null
  };
}

function toNumberOrNull(value: number | string | null | undefined) {
  if (value == null) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
