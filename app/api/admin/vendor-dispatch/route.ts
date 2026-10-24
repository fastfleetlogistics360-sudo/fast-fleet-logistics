import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient(); if (!db) return NextResponse.json({ error: "Vendor Dispatch is not configured." }, { status: 503 });
  const [restaurants, cyclists, authorizations, settlements, deliveries] = await Promise.all([
    db.from("business_profiles").select("id, business_name, registration_status").eq("registration_status", "active").order("business_name").limit(200),
    db.from("rider_profiles").select("id, users:users!rider_profiles_user_id_fkey(full_name)").eq("application_status", "approved").order("created_at", { ascending: false }).limit(200),
    db.from("vendor_dispatch_authorizations").select("id, restaurant_id, assigned_cyclist_id, authorization_status, authorized_at, business_profiles(business_name), rider_profiles(users:users!rider_profiles_user_id_fkey(full_name))").order("updated_at", { ascending: false }),
    db.from("vendor_dispatch_daily_settlements").select("id, restaurant_id, business_date, delivery_count, total_delivery_fees_kobo, settlement_status, closed_at, business_profiles(business_name)").order("business_date", { ascending: false }).limit(250),
    db.from("vendor_dispatch_deliveries").select("id, restaurant_id, destination, delivery_fee_kobo, business_date, delivery_status, created_at, business_profiles(business_name), rider_profiles(users:users!rider_profiles_user_id_fkey(full_name))").order("created_at", { ascending: false }).limit(250)
  ]);
  const error = restaurants.error || cyclists.error || authorizations.error || settlements.error || deliveries.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ restaurants: restaurants.data || [], cyclists: cyclists.data || [], authorizations: authorizations.data || [], settlements: settlements.data || [], deliveries: deliveries.data || [] });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession(request); if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request); if (limited) return limited;
  const db = createAdminClient(); if (!db) return NextResponse.json({ error: "Vendor Dispatch is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})); const action = String(body.action || "");
  if (action === "authorize") {
    const restaurantId = String(body.restaurantId || ""), cyclistId = String(body.cyclistId || "");
    if (!restaurantId || !cyclistId) return NextResponse.json({ error: "Select a restaurant and cyclist." }, { status: 400 });
    const { data, error } = await db.from("vendor_dispatch_authorizations").upsert({ restaurant_id: restaurantId, assigned_cyclist_id: cyclistId, authorization_status: "active", authorized_by: admin.userId, authorized_at: new Date().toISOString(), revoked_at: null }, { onConflict: "restaurant_id" }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await db.from("vendor_dispatch_audit_events").insert({ restaurant_id: restaurantId, actor_id: admin.userId, action: "restaurant_authorized", metadata: { cyclist_id: cyclistId } });
    return NextResponse.json({ authorization: data });
  }
  if (action === "revoke") {
    const restaurantId = String(body.restaurantId || "");
    const { error } = await db.from("vendor_dispatch_authorizations").update({ authorization_status: "revoked", revoked_at: new Date().toISOString() }).eq("restaurant_id", restaurantId).eq("authorization_status", "active");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await db.from("vendor_dispatch_audit_events").insert({ restaurant_id: restaurantId, actor_id: admin.userId, action: "restaurant_revoked" });
    return NextResponse.json({ ok: true });
  }
  if (action === "settle") {
    const settlementId = String(body.settlementId || "");
    const { data, error } = await db.from("vendor_dispatch_daily_settlements").update({ settlement_status: "settled", confirmed_at: new Date().toISOString(), confirmed_by: admin.userId }).eq("id", settlementId).eq("settlement_status", "awaiting_payment").select("id, restaurant_id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Settlement is already confirmed or was not found." }, { status: 409 });
    await db.from("vendor_dispatch_audit_events").insert({ restaurant_id: data.restaurant_id, settlement_id: data.id, actor_id: admin.userId, action: "payment_confirmed" });
    return NextResponse.json({ settlement: data });
  }
  if (action === "verify-delivery") {
    const deliveryId = String(body.deliveryId || "");
    const { data, error } = await db.from("vendor_dispatch_deliveries").update({ delivery_status: "verified_completed" }).eq("id", deliveryId).eq("delivery_status", "recorded").select("id, restaurant_id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Delivery is already verified or was not found." }, { status: 409 });
    await db.from("vendor_dispatch_audit_events").insert({ restaurant_id: data.restaurant_id, delivery_id: data.id, actor_id: admin.userId, action: "delivery_verified_completed" });
    return NextResponse.json({ delivery: data });
  }
  return NextResponse.json({ error: "Unknown Vendor Dispatch action." }, { status: 400 });
}
