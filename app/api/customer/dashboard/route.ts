import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isNoChargeDelivery, verifiedDeliveryPaymentIds } from "@/lib/payment-authorization";

const orderSelectWithRiderTag =
  "id, rider_id, delivery_code, pickup_address, dropoff_address, status, price_ngn, created_at, delivered_at, proof_url, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, avatar_url))";

const orderSelectWithoutRiderTag =
  "id, rider_id, delivery_code, pickup_address, dropoff_address, status, price_ngn, created_at, delivered_at, proof_url, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(plate_number, vehicle_type, vehicle_color, users:users!rider_profiles_user_id_fkey(full_name, phone, avatar_url))";

const businessOrderSelect =
  "id, rider_id, order_code, delivery_id, marketplace_kind, items, pickup_address, dropoff_address, package_type, fulfilment_method, payment_status, status, amount, created_at, updated_at, delivered_at, proof_of_delivery_url";

const linkedMarketplaceDeliverySelect =
  "id, rider_id, delivery_code, pickup_address, dropoff_address, status, price_ngn, created_at, delivered_at, proof_url, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, email, avatar_url))";

type RiderUserProjection = { full_name?: string | null; phone?: string | null; email?: string | null; avatar_url?: string | null };
type RiderProfileProjection = { plate_number?: string | null; vehicle_type?: string | null; vehicle_color?: string | null; rider_account_type?: string | null; users?: RiderUserProjection | RiderUserProjection[] | null };
type DeliveryContactProjection = { id: string; price_ngn?: number | string | null; created_at?: string | null; rider_profiles?: RiderProfileProjection | RiderProfileProjection[] | null; [key: string]: unknown };

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Please sign in to load your dashboard." }, { status: 401 });
    }

    const admin = createAdminClient();
    const db = admin || supabase;

    const [profileResult, appUserResult, walletResult, orderResult, promotionResult, addressResult] = await Promise.all([
      db.from("profiles").select("id, full_name, email, phone, avatar_url, lga, kyc_status").eq("user_id", user.id).maybeSingle(),
      db.from("users").select("default_zone").eq("id", user.id).maybeSingle(),
      loadCustomerWallet(db, user.id),
      loadOrders(db, user.id),
      db.from("promotions").select("id, title, image_url, cta_label, cta_url, active").eq("active", true).order("created_at", { ascending: false }).limit(8),
      db.from("saved_addresses").select("id, label, address").eq("user_id", user.id).order("created_at", { ascending: false })
    ]);

    if (orderResult.error) throw orderResult.error;
    if (promotionResult.error) throw promotionResult.error;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email || null,
        phone: user.phone || null,
        metadata: user.user_metadata || {}
      },
      profile: profileResult.data || null,
      appUser: appUserResult.data || null,
      wallet: walletResult.data || null,
      orders: orderResult.data || [],
      promotions: promotionResult.data || [],
      addresses: addressResult.data || []
    });
  } catch (error) {
    return NextResponse.json({ error: readableError(error, "Could not load your dashboard data.") }, { status: 500 });
  }
}

async function loadCustomerWallet(db: SupabaseClient, userId: string) {
  const result = await db
    .from("wallets")
    .select("balance_ngn, locked_balance_ngn, balance, loyalty_credit_ngn, loyalty_credit_initial_ngn, loyalty_credit_exhausted_at")
    .eq("user_id", userId)
    .eq("wallet_type", "customer")
    .maybeSingle();
  if (!result.error || !/loyalty_credit|schema cache|column/i.test(result.error.message)) return result;
  return db.from("wallets").select("balance_ngn, locked_balance_ngn, balance").eq("user_id", userId).eq("wallet_type", "customer").maybeSingle();
}

async function loadOrders(db: SupabaseClient, userId: string) {
  const result = await db
    .from("deliveries")
    .select(orderSelectWithRiderTag)
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  const deliveries = !result.error || !/rider_account_type/i.test(result.error.message)
    ? result
    : await db
        .from("deliveries")
        .select(orderSelectWithoutRiderTag)
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

  if (deliveries.error) return deliveries;

  const businessOrders = await db
    .from("orders")
    .select(businessOrderSelect)
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (businessOrders.error) return deliveries;

  const linkedDeliveryIds = (businessOrders.data || [])
    .map((order) => order.delivery_id)
    .filter((deliveryId): deliveryId is string => typeof deliveryId === "string" && deliveryId.length > 0);
  const linkedDeliveries = linkedDeliveryIds.length
    ? await db.from("deliveries").select(linkedMarketplaceDeliverySelect).in("id", linkedDeliveryIds)
    : { data: [], error: null };
  const linkedDeliveryById = new Map((linkedDeliveries.data || []).map((delivery) => [delivery.id, delivery]));

  const mappedBusinessOrders = (businessOrders.data || [])
    .map((order) => {
      const linkedDelivery = order.delivery_id ? linkedDeliveryById.get(order.delivery_id) : null;
      return {
        id: order.id,
        rider_id: linkedDelivery?.rider_id || order.rider_id,
        delivery_id: order.delivery_id,
        delivery_code: String(order.order_code || order.id).toUpperCase(),
        pickup_address: linkedDelivery?.pickup_address || order.pickup_address,
        dropoff_address: linkedDelivery?.dropoff_address || order.dropoff_address,
        status: linkedDelivery?.status || order.status,
        price_ngn: Number(order.amount || 0),
        created_at: order.created_at,
        delivered_at: linkedDelivery?.delivered_at || order.delivered_at,
        proof_url: order.proof_of_delivery_url,
        metadata: linkedDelivery?.metadata || null,
        fulfilment_method: order.fulfilment_method,
        payment_status: order.payment_status,
        rider_profiles: linkedDelivery?.rider_profiles || null,
        marketplace_kind: order.marketplace_kind,
        items: order.items,
        source: "business_marketplace_order"
      };
    });
  const businessOrderCodes = new Set(mappedBusinessOrders.map((order) => String(order.delivery_code || "").toUpperCase()));
  const visibleDeliveries = (deliveries.data || []).filter((delivery) => !businessOrderCodes.has(String(delivery.delivery_code || "").toUpperCase()));

  const allDeliveries = [...(deliveries.data || []), ...(linkedDeliveries.data || [])] as Array<{ id: string; price_ngn?: number | string | null }>;
  const paidDeliveryIds = await verifiedDeliveryPaymentIds(db, allDeliveries.map((delivery) => delivery.id));
  const contactUnlocked = (delivery: { id: string; price_ngn?: number | string | null }) => paidDeliveryIds.has(delivery.id) || isNoChargeDelivery(delivery);
  const redactRiderContact = (delivery: DeliveryContactProjection) => {
    const riderProfile = Array.isArray(delivery.rider_profiles) ? delivery.rider_profiles[0] : delivery.rider_profiles;
    const users = Array.isArray(riderProfile?.users) ? riderProfile.users[0] : riderProfile?.users;
    if (!users) return delivery;
    const unlocked = contactUnlocked(delivery);
    return {
      ...delivery,
      contact_unlocked: unlocked,
      rider_profiles: {
        ...riderProfile,
        users: { ...users, phone: unlocked ? users.phone : null, email: unlocked ? users.email : null }
      }
    };
  };

  return {
    ...deliveries,
    data: ([...mappedBusinessOrders, ...visibleDeliveries] as unknown as DeliveryContactProjection[])
      .map(redactRiderContact)
      .sort((first, second) => new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime())
  };
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}
