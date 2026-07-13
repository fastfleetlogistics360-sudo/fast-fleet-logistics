import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const orderSelectWithRiderTag =
  "id, rider_id, delivery_code, pickup_address, dropoff_address, status, price_ngn, created_at, delivered_at, proof_url, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, avatar_url))";

const orderSelectWithoutRiderTag =
  "id, rider_id, delivery_code, pickup_address, dropoff_address, status, price_ngn, created_at, delivered_at, proof_url, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(plate_number, vehicle_type, vehicle_color, users:users!rider_profiles_user_id_fkey(full_name, phone, avatar_url))";

const businessOrderSelect =
  "id, rider_id, order_code, delivery_id, marketplace_kind, items, pickup_address, dropoff_address, package_type, status, amount, created_at, updated_at, delivered_at, proof_of_delivery_url";

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
      db.from("wallets").select("balance_ngn, locked_balance_ngn, balance").eq("user_id", user.id).eq("wallet_type", "customer").maybeSingle(),
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

  const mappedBusinessOrders = (businessOrders.data || [])
    .map((order) => ({
      id: order.id,
      rider_id: order.rider_id,
      delivery_id: order.delivery_id,
      delivery_code: String(order.order_code || order.id).toUpperCase(),
      pickup_address: order.pickup_address,
      dropoff_address: order.dropoff_address,
      status: order.status,
      price_ngn: Number(order.amount || 0),
      created_at: order.created_at,
      delivered_at: order.delivered_at,
      proof_url: order.proof_of_delivery_url,
      metadata: null,
      marketplace_kind: order.marketplace_kind,
      items: order.items,
      source: "business_marketplace_order"
    }));
  const businessOrderCodes = new Set(mappedBusinessOrders.map((order) => String(order.delivery_code || "").toUpperCase()));
  const visibleDeliveries = (deliveries.data || []).filter((delivery) => !businessOrderCodes.has(String(delivery.delivery_code || "").toUpperCase()));

  return {
    ...deliveries,
    data: [...mappedBusinessOrders, ...visibleDeliveries].sort((first, second) => new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime())
  };
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}
