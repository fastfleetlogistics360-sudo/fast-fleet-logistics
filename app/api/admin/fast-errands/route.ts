import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { ensureWallet } from "@/lib/wallet-ledger";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to manage FastErrands." }, { status: 503 });
  const { data, error } = await db
    .from("fast_errand_orders")
    .select("id, errand_code, vendor_name, request_items, purchase_budget_ngn, actual_purchase_ngn, delivery_fee_ngn, service_fee_ngn, customer_total_ngn, vendor_transfer_reference, receipt_url, status, top_up_required_ngn, funded_at, vendor_funded_at, created_at, deliveries(id, delivery_code, status, pickup_address, dropoff_address), business_profiles(id, business_name, user_id), users:users!fast_errand_orders_customer_id_fkey(full_name, email, phone)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ errands: data || [] });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const errandId = String(body.errandId || "").trim();
  const actualPurchaseNgn = Math.round(Number(body.actualPurchaseNgn || 0));
  const transferReference = String(body.transferReference || "").trim().slice(0, 160);
  if (!errandId || actualPurchaseNgn < 1 || !transferReference) return NextResponse.json({ error: "Enter the actual purchase amount and your Squad transfer reference." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "FastErrands admin funding is not configured." }, { status: 503 });

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
