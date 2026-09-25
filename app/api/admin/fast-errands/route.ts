import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { ensureWallet } from "@/lib/wallet-ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { fastErrandsVendorSettingsKey, normalizeFastErrandsVendorIds } from "@/lib/fast-errands-vendors";
import { fastErrandsControlsSettingsKey, fastErrandsFulfilmentBusinessSettingsKey, loadFastErrandsCatalog, loadFastErrandsControls } from "@/lib/fast-errands-catalog";
import type { Json } from "@/lib/supabase/types";

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to manage FastErrands." }, { status: 503 });
  const [{ data, error }, { data: businesses }, { data: legacySetting }, { data: fulfilmentSetting }, catalog, controls, areasResult, currentOrdersResult] = await Promise.all([
    db
    .from("fast_errand_orders")
    .select("id, errand_code, vendor_name, request_items, purchase_budget_ngn, actual_purchase_ngn, delivery_fee_ngn, service_fee_ngn, customer_total_ngn, vendor_transfer_reference, receipt_url, status, top_up_required_ngn, funded_at, vendor_funded_at, created_at, deliveries(id, delivery_code, status, pickup_address, dropoff_address), business_profiles(id, business_name, user_id), users:users!fast_errand_orders_customer_id_fkey(full_name, email, phone)")
    .order("created_at", { ascending: false })
    .limit(100),
    db.from("business_profiles").select("id, business_name, operating_state, pickup_address").eq("registration_status", "active").order("business_name").limit(200),
    db.from("platform_settings").select("value").eq("key", fastErrandsVendorSettingsKey).maybeSingle(),
    db.from("platform_settings").select("value").eq("key", fastErrandsFulfilmentBusinessSettingsKey).maybeSingle(),
    loadFastErrandsCatalog(true),
    loadFastErrandsControls(),
    db.from("fast_errand_service_areas").select("*, fast_errand_service_area_bands(*)").order("priority").limit(100),
    db.from("orders").select("id, order_code, customer_id, business_profile_id, marketplace_kind, items, amount, delivery_fee_ngn, payment_status, status, distance_km, delivery_id, metadata, created_at, users:users!orders_customer_id_fkey(full_name, email), business_profiles(business_name), deliveries(id, delivery_code, status, rider_id, fleet_asset_id, fast_errand_delivery_payouts(payout_model))").eq("marketplace_kind", "fast_errands").order("created_at", { ascending: false }).limit(100)
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const fulfilmentValue = fulfilmentSetting?.value;
  const fulfilmentBusinessId = typeof fulfilmentValue === "string" ? fulfilmentValue : fulfilmentValue && typeof fulfilmentValue === "object" && !Array.isArray(fulfilmentValue) && typeof (fulfilmentValue as { businessId?: unknown }).businessId === "string" ? (fulfilmentValue as { businessId: string }).businessId : null;
  return NextResponse.json({ errands: data || [], businesses: businesses || [], selectedBusinessIds: normalizeFastErrandsVendorIds(legacySetting?.value), fulfilmentBusinessId, catalog, controls, serviceAreas: areasResult.data || [], currentOrders: currentOrdersResult.data || [] });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "FastErrands admin funding is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  if (action === "save-controls") {
    const enabled = body.enabled !== false;
    const customerNotice = String(body.customerNotice || "").trim().slice(0, 280) || null;
    const mode = body.mode === "neighborhood" ? "neighborhood" : "legacy";
    const { error } = await db.from("platform_settings").upsert({ key: fastErrandsControlsSettingsKey, value: { enabled, customerNotice, mode } as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ controls: { enabled, customerNotice, mode } });
  }
  if (action === "add-note") {
    const errandId = String(body.errandId || "").trim();
    const note = String(body.note || "").trim().slice(0, 1000);
    if (!errandId || !note) return NextResponse.json({ error: "Enter an internal FastErrands note." }, { status: 400 });
    const { data: errand } = await db.from("fast_errand_orders").select("id").eq("id", errandId).maybeSingle<{ id: string }>();
    if (!errand) return NextResponse.json({ error: "FastErrand not found." }, { status: 404 });
    const { error } = await db.from("fast_errand_events").insert({ errand_id: errand.id, actor_id: admin.userId, event_type: "admin_note", body: note, metadata: { source: "fast_errands_admin" } });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (action === "set-fulfilment-business") {
    const businessProfileId = String(body.businessProfileId || "").trim();
    const { data: business } = await db.from("business_profiles").select("id").eq("id", businessProfileId).eq("registration_status", "active").maybeSingle<{ id: string }>();
    if (!business) return NextResponse.json({ error: "Choose an active registered business account." }, { status: 400 });
    const { error } = await db.from("platform_settings").upsert({ key: fastErrandsFulfilmentBusinessSettingsKey, value: { businessId: business.id } as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ fulfilmentBusinessId: business.id });
  }
  if (action === "save-category") {
    const id = String(body.id || "").trim();
    const name = String(body.name || "").trim().slice(0, 80);
    const description = String(body.description || "").trim().slice(0, 300) || null;
    const emoji = String(body.emoji || "").trim().slice(0, 16) || null;
    const sortOrder = Math.max(0, Math.round(Number(body.sortOrder || 0)));
    const isActive = body.isActive !== false;
    if (name.length < 2) return NextResponse.json({ error: "Enter a category name." }, { status: 400 });
    const mutation = id ? db.from("fast_errand_categories").update({ name, description, emoji, sort_order: sortOrder, is_active: isActive }).eq("id", id).select("id").maybeSingle() : db.from("fast_errand_categories").insert({ name, description, emoji, sort_order: sortOrder, is_active: isActive }).select("id").single();
    const { error } = await mutation;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ catalog: await loadFastErrandsCatalog(true) });
  }
  if (action === "save-item") {
    const id = String(body.id || "").trim();
    const categoryId = String(body.categoryId || "").trim();
    const name = String(body.name || "").trim().slice(0, 120);
    const description = String(body.description || "").trim().slice(0, 300) || null;
    const priceNgn = Math.round(Number(body.priceNgn || 0));
    const sortOrder = Math.max(0, Math.round(Number(body.sortOrder || 0)));
    const isActive = body.isActive !== false;
    if (!categoryId || name.length < 2 || priceNgn < 1) return NextResponse.json({ error: "Choose a category and enter an item name and price." }, { status: 400 });
    const mutation = id ? db.from("fast_errand_catalog_items").update({ category_id: categoryId, name, description, price_ngn: priceNgn, sort_order: sortOrder, is_active: isActive }).eq("id", id).select("id").maybeSingle() : db.from("fast_errand_catalog_items").insert({ category_id: categoryId, name, description, price_ngn: priceNgn, sort_order: sortOrder, is_active: isActive }).select("id").single();
    const { error } = await mutation;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ catalog: await loadFastErrandsCatalog(true) });
  }
  if (action === "save-service-area") {
    const id = String(body.id || "").trim();
    const code = String(body.code || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 63);
    const name = String(body.name || "").trim().slice(0, 120);
    const businessProfileId = String(body.businessProfileId || "").trim();
    const originAddress = String(body.originAddress || "").trim().slice(0, 500);
    const originPlaceId = String(body.originPlaceId || "").trim().slice(0, 255) || null;
    const maximumDistanceMeters = Math.round(Number(body.maximumDistanceMeters || 0));
    const minimumCartNgn = Math.round(Number(body.minimumCartNgn || 1500));
    const priority = Math.round(Number(body.priority || 100));
    const pricingVersion = Math.max(1, Math.round(Number(body.pricingVersion || 1)));
    const isActive = body.isActive === true;
    if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(code) || name.length < 2 || !businessProfileId || originAddress.length < 6 || maximumDistanceMeters < 1 || minimumCartNgn < 1) return NextResponse.json({ error: "Enter a valid code, name, fulfilment business, origin, distance and minimum cart." }, { status: 400 });
    const payload = { code, name, business_profile_id: businessProfileId, origin_address: originAddress, origin_place_id: originPlaceId, origin_latitude: numberOrNull(body.originLatitude), origin_longitude: numberOrNull(body.originLongitude), maximum_distance_meters: maximumDistanceMeters, minimum_cart_ngn: minimumCartNgn, priority, pricing_version: pricingVersion, is_active: isActive };
    const result = id ? await db.from("fast_errand_service_areas").update(payload).eq("id", id) : await db.from("fast_errand_service_areas").insert(payload);
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (action === "save-service-area-bands") {
    const serviceAreaId = String(body.serviceAreaId || "").trim();
    const bands: Array<{ minDistanceExclusiveMeters?: unknown; maxDistanceInclusiveMeters?: unknown; serviceFeeNgn?: unknown; isActive?: unknown }> = Array.isArray(body.bands) ? body.bands : [];
    if (!serviceAreaId || !bands.length || bands.length > 20) return NextResponse.json({ error: "Add valid pricing bands." }, { status: 400 });
    const rows = bands.map((band, index) => ({ service_area_id: serviceAreaId, min_distance_exclusive_meters: Math.round(Number(band?.minDistanceExclusiveMeters || 0)), max_distance_inclusive_meters: Math.round(Number(band?.maxDistanceInclusiveMeters || 0)), service_fee_ngn: Math.round(Number(band?.serviceFeeNgn || 0)), sort_order: index, is_active: band?.isActive !== false }));
    if (rows.some((row) => row.min_distance_exclusive_meters < 0 || row.max_distance_inclusive_meters <= row.min_distance_exclusive_meters || row.service_fee_ngn < 0)) return NextResponse.json({ error: "Pricing bands contain invalid values." }, { status: 400 });
    const { error: removeError } = await db.from("fast_errand_service_area_bands").delete().eq("service_area_id", serviceAreaId);
    if (removeError) return NextResponse.json({ error: removeError.message }, { status: 400 });
    const { error } = await db.from("fast_errand_service_area_bands").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (Array.isArray(body.vendorBusinessIds)) {
    const requestedIds = normalizeFastErrandsVendorIds(body.vendorBusinessIds);
    const { data: activeBusinesses, error } = await db.from("business_profiles").select("id").eq("registration_status", "active").in("id", requestedIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const selectedBusinessIds = (activeBusinesses || []).map((business) => business.id);
    if (selectedBusinessIds.length !== requestedIds.length) return NextResponse.json({ error: "Only active registered business accounts can be selected for FastErrands." }, { status: 400 });
    const { error: saveError } = await db.from("platform_settings").upsert({ key: fastErrandsVendorSettingsKey, value: { businessIds: selectedBusinessIds } as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 400 });
    return NextResponse.json({ selectedBusinessIds });
  }
  const errandId = String(body.errandId || "").trim();
  const actualPurchaseNgn = Math.round(Number(body.actualPurchaseNgn || 0));
  const transferReference = String(body.transferReference || "").trim().slice(0, 160);
  if (!errandId || actualPurchaseNgn < 1 || !transferReference) return NextResponse.json({ error: "Enter the actual purchase amount and your Squad transfer reference." }, { status: 400 });
  const { data: errand, error } = await db
    .from("fast_errand_orders")
    .select("id, errand_code, customer_id, business_profile_id, purchase_budget_ngn, status, delivery_id, deliveries(status, metadata), business_profiles(user_id)")
    .eq("id", errandId)
    .maybeSingle<{ id: string; errand_code: string; customer_id: string; business_profile_id: string; purchase_budget_ngn: number; status: string; delivery_id: string; deliveries?: { status?: string | null; metadata?: Record<string, unknown> | null } | null; business_profiles?: { user_id?: string | null } | null }>();
  if (error || !errand) return NextResponse.json({ error: "FastErrand not found." }, { status: 404 });
  if (errand.status === "vendor_funded") return NextResponse.json({ error: "This vendor has already been funded." }, { status: 409 });
  if (errand.deliveries?.status !== "searching") return NextResponse.json({ error: "Wait for the customer Squad payment to be confirmed before funding this vendor." }, { status: 409 });
  if (actualPurchaseNgn > Number(errand.purchase_budget_ngn)) {
    await db.from("fast_errand_orders").update({ status: "top_up_required", top_up_required_ngn: actualPurchaseNgn - Number(errand.purchase_budget_ngn) }).eq("id", errand.id);
    return NextResponse.json({ topUpRequired: actualPurchaseNgn - Number(errand.purchase_budget_ngn) }, { status: 409 });
  }
  const vendorUserId = errand.business_profiles?.user_id;
  if (!vendorUserId) return NextResponse.json({ error: "The verified vendor wallet is not available." }, { status: 409 });
  const providerReference = `fast-errand:${errand.id}:vendor-funding`;
  const { data: duplicate } = await db.from("transactions").select("id").eq("provider_reference", providerReference).maybeSingle();
  if (!duplicate) {
    const vendorWallet = await ensureWallet(db, vendorUserId, "customer");
    const { error: creditError } = await db.from("transactions").insert({ wallet_id: vendorWallet.id, delivery_id: errand.delivery_id, transaction_type: "wallet_funding", amount_ngn: actualPurchaseNgn, status: "successful", provider: "manual_squad_fast_errand_transfer", provider_reference: providerReference, reference: transferReference, description: `FastErrands vendor funding ${errand.errand_code}`, metadata: { errand_id: errand.id, business_profile_id: errand.business_profile_id, admin_manual_transfer: true } });
    if (creditError) return NextResponse.json({ error: creditError.message }, { status: 400 });
    await db.from("wallets").update({ balance_ngn: Number(vendorWallet.balance_ngn || 0) + actualPurchaseNgn, updated_at: new Date().toISOString() }).eq("id", vendorWallet.id);
  }
  const refund = Math.max(0, Number(errand.purchase_budget_ngn) - actualPurchaseNgn);
  if (refund) {
    const customerWallet = await ensureWallet(db, errand.customer_id, "customer");
    const refundReference = `fast-errand:${errand.id}:customer-refund`;
    const { data: refundExists } = await db.from("transactions").select("id").eq("provider_reference", refundReference).maybeSingle();
    if (!refundExists) {
      await db.from("transactions").insert({ wallet_id: customerWallet.id, delivery_id: errand.delivery_id, transaction_type: "refund", amount_ngn: refund, status: "successful", provider: "fast_errands", provider_reference: refundReference, description: `Unused FastErrands budget refund ${errand.errand_code}`, metadata: { errand_id: errand.id } });
      await db.from("wallets").update({ balance_ngn: Number(customerWallet.balance_ngn || 0) + refund, updated_at: new Date().toISOString() }).eq("id", customerWallet.id);
    }
  }
  const now = new Date().toISOString();
  await Promise.all([
    db.from("fast_errand_orders").update({ status: "vendor_funded", actual_purchase_ngn: actualPurchaseNgn, vendor_transfer_reference: transferReference, vendor_funded_at: now, updated_at: now }).eq("id", errand.id),
    db.from("deliveries").update({ metadata: { ...(errand.deliveries?.metadata || {}), source: "fast_errands", vendor_funding_status: "funded", fast_errand_id: errand.id }, updated_at: now }).eq("id", errand.delivery_id),
    db.from("fast_errand_events").insert({ errand_id: errand.id, actor_id: admin.userId, event_type: "vendor_funded", body: "Admin recorded the manual Squad transfer and released the rider.", metadata: { actual_purchase_ngn: actualPurchaseNgn, refund_ngn: refund, transfer_reference: transferReference } })
  ]);
  return NextResponse.json({ ok: true, refundNgn: refund });
}
