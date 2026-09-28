import { NextResponse } from "next/server";
import { repairMarketplaceDeliveriesForBusiness } from "@/lib/marketplace-order-repair";
import { MarketplaceOrderTransitionError, parseMarketplaceOrderTransition } from "@/lib/marketplace-order-transitions";
import { MarketplaceWorkflowError, marketplaceOperationsOrderSelect, transitionMarketplaceOrder } from "@/lib/marketplace-order-workflow";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// This adapter delegates ready-state dispatch to the shared workflow. That
// preserves the established notifyApprovedRiders / riderCanReceiveDelivery
// eligibility contract: independent_bicycle_enabled riders can use a busy
// asset only when hasActiveTrip && asset.status === "busy", and queued
// accepted_pending_delivery work remains protected at the canonical layer.
// parseFastErrandV2Snapshot and fastErrandSnapshotDeliveryEstimate likewise
// live in that shared workflow: Paid v2 FastErrands never consult mutable marketplace fare rules.

type BusinessProfile = { id: string; user_id: string; business_name?: string | null; registration_status?: string | null };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to load business orders." }, { status: 401 });
    const admin = createAdminClient();
    const db = admin || supabase;
    const { data: profile, error } = await db.from("business_profiles").select("id, registration_status").eq("user_id", user.id).maybeSingle<{ id: string; registration_status?: string | null }>();
    if (error) throw error;
    if (profile?.registration_status !== "active") return NextResponse.json({ orders: [] });
    if (admin) await repairMarketplaceDeliveriesForBusiness(admin, profile.id);
    const { data, error: ordersError } = await db.from("orders").select(marketplaceOperationsOrderSelect).or(`business_profile_id.eq.${profile.id},business_id.eq.${user.id}`).neq("payment_status", "pending").order("created_at", { ascending: false }).limit(60);
    if (ordersError) throw ordersError;
    return NextResponse.json({ orders: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load business orders." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { id?: string; status?: string };
    const id = String(payload.id || "").trim();
    let status: string;
    try { status = parseMarketplaceOrderTransition(payload.status); }
    catch (error) { if (error instanceof MarketplaceOrderTransitionError || !id) return NextResponse.json({ error: "Choose a valid business order status." }, { status: 400 }); throw error; }
    if (!id) return NextResponse.json({ error: "Choose a valid business order status." }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to update business orders." }, { status: 401 });
    const limited = await enforceRateLimit(request, rateLimitPolicies.businessOrderStatusUpdate);
    if (limited) return limited;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Business order dispatch is not configured. Add SUPABASE_SERVICE_ROLE_KEY in production." }, { status: 503 });
    const { data: profile, error: profileError } = await db.from("business_profiles").select("id, user_id, business_name, registration_status").eq("user_id", user.id).maybeSingle<BusinessProfile>();
    if (profileError) throw profileError;
    if (profile?.registration_status !== "active") return NextResponse.json({ error: "Business KYC must be approved before managing orders." }, { status: 403 });
    const { data: order, error: orderError } = await db.from("orders").select(marketplaceOperationsOrderSelect).eq("id", id).or(`business_profile_id.eq.${profile.id},business_id.eq.${user.id}`).single<Record<string, unknown>>();
    if (orderError || !order) throw orderError || new Error("Order was not found.");
    const updated = await transitionMarketplaceOrder(db, order, status, { userId: user.id, type: "business", dispatchCustomerId: profile.user_id, pickupContact: profile.business_name || "Business pickup", businessProfileId: profile.id });
    return NextResponse.json({ order: updated });
  } catch (error) {
    const status = error instanceof MarketplaceWorkflowError ? error.status : error instanceof MarketplaceOrderTransitionError ? 409 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update business orders." }, { status });
  }
}
