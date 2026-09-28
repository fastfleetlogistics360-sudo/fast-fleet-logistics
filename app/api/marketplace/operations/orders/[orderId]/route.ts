import { NextResponse } from "next/server";
import { hasActiveMarketplaceOperatorScope, activeMarketplaceOperatorMemberships } from "@/lib/marketplace-operator-auth";
import { MarketplaceOrderTransitionError, parseMarketplaceOrderTransition } from "@/lib/marketplace-order-transitions";
import { MarketplaceWorkflowError, marketplaceOperationsOrderSelect, transitionMarketplaceOrder } from "@/lib/marketplace-order-workflow";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await context.params;
    const payload = await request.json().catch(() => ({})) as { status?: string };
    const status = parseMarketplaceOrderTransition(payload.status);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to update Marketplace orders." }, { status: 401 });
    const limited = await enforceRateLimit(request, rateLimitPolicies.marketplaceOperatorOrderUpdate);
    if (limited) return limited;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Marketplace Operations is not configured." }, { status: 503 });
    const { data: order, error: orderError } = await db.from("orders").select(marketplaceOperationsOrderSelect).eq("id", orderId).maybeSingle<Record<string, unknown>>();
    if (orderError) throw orderError;
    if (!order || typeof order.marketplace_vendor_id !== "string") return NextResponse.json({ error: "Marketplace order was not found." }, { status: 404 });
    const [inScope, memberships, vendorResult] = await Promise.all([
      hasActiveMarketplaceOperatorScope(db, user.id, order.marketplace_vendor_id),
      activeMarketplaceOperatorMemberships(db, user.id),
      db.from("marketplace_vendors").select("id, display_name, operational_mode, managed_by_fastfleet").eq("id", order.marketplace_vendor_id).maybeSingle<{ id: string; display_name: string; operational_mode: string; managed_by_fastfleet: boolean }>()
    ]);
    if (!inScope || vendorResult.error || !vendorResult.data || vendorResult.data.operational_mode !== "fastfleet_managed" || !vendorResult.data.managed_by_fastfleet) return NextResponse.json({ error: "That order is outside your Marketplace Operations scope." }, { status: 403 });
    const membership = memberships.find((item) => item.all_vendors || item.marketplace_vendor_id === order.marketplace_vendor_id);
    if (!membership) return NextResponse.json({ error: "Marketplace operator access is required." }, { status: 403 });
    const updated = await transitionMarketplaceOrder(db, order, status, { userId: user.id, type: "operator", role: membership.role, dispatchCustomerId: typeof order.business_id === "string" ? order.business_id : typeof order.customer_id === "string" ? order.customer_id : user.id, pickupContact: vendorResult.data.display_name, businessProfileId: typeof order.business_profile_id === "string" ? order.business_profile_id : null });
    return NextResponse.json({ order: updated });
  } catch (error) {
    const status = error instanceof MarketplaceWorkflowError ? error.status : error instanceof MarketplaceOrderTransitionError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Marketplace order." }, { status });
  }
}
