import { NextResponse } from "next/server";
import { normalizeMarketplacePickupCode, verifyMarketplacePickupCode, type PickupConfirmation } from "@/lib/marketplace-pickup-confirmation";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in as the vendor." }, { status: 401 });
    const limited = await enforceRateLimit(request, rateLimitPolicies.businessOrderStatusUpdate);
    if (limited) return limited;
    const body = await request.json().catch(() => ({})) as { orderId?: string; code?: string };
    const orderId = String(body.orderId || ""); const code = normalizeMarketplacePickupCode(body.code);
    if (!orderId || code.length !== 6) return NextResponse.json({ error: "Enter the six-digit pickup code." }, { status: 400 });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Pickup confirmation is unavailable." }, { status: 503 });
    const { data: profile } = await db.from("business_profiles").select("id, registration_status").eq("user_id", user.id).maybeSingle<{ id: string; registration_status?: string | null }>();
    if (!profile || profile.registration_status !== "active") return NextResponse.json({ error: "An active vendor account is required." }, { status: 403 });
    const { data: order } = await db.from("orders").select("id, business_profile_id, fulfilment_method, payment_status, status").eq("id", orderId).eq("business_profile_id", profile.id).maybeSingle<{ id: string; business_profile_id?: string | null; fulfilment_method?: string | null; payment_status?: string | null; status?: string | null }>();
    if (!order || order.fulfilment_method !== "PICKUP") return NextResponse.json({ error: "Pickup order not found." }, { status: 404 });
    if (order.payment_status !== "paid" || order.status !== "ready_for_pickup") return NextResponse.json({ error: "Only a verified paid order ready for pickup can be collected." }, { status: 409 });
    const { data: confirmation } = await db.from("marketplace_pickup_confirmations").select("order_id, code_digest, code_ciphertext, status, attempts, max_attempts").eq("order_id", order.id).maybeSingle<PickupConfirmation>();
    if (!confirmation || confirmation.status === "verified") return NextResponse.json({ error: "This pickup code has already been used." }, { status: 409 });
    if (confirmation.status === "locked" || confirmation.attempts >= confirmation.max_attempts) return NextResponse.json({ error: "Pickup code entry is locked. Contact support." }, { status: 423 });
    if (!verifyMarketplacePickupCode(code, order.id, confirmation.code_digest)) {
      const attempts = confirmation.attempts + 1; const locked = attempts >= confirmation.max_attempts;
      await db.from("marketplace_pickup_confirmations").update({ attempts, status: locked ? "locked" : "pending", updated_at: new Date().toISOString() }).eq("order_id", order.id).eq("attempts", confirmation.attempts);
      return NextResponse.json({ error: locked ? "Pickup code entry is locked. Contact support." : "That pickup code is incorrect.", attemptsRemaining: Math.max(0, confirmation.max_attempts - attempts) }, { status: locked ? 423 : 400 });
    }
    const { data, error } = await db.rpc("complete_marketplace_pickup", { target_order_id: order.id, expected_code_digest: confirmation.code_digest, verified_by_user_id: user.id });
    if (error || !data) return NextResponse.json({ error: "Pickup could not be completed. Please try again." }, { status: 409 });
    return NextResponse.json({ status: "delivered", orderId: order.id });
  } catch { return NextResponse.json({ error: "Could not verify pickup code." }, { status: 500 }); }
}
