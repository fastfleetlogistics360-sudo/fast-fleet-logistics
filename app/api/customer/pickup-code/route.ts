import { NextResponse } from "next/server";
import { marketplacePickupCodeExpired, revealMarketplacePickupCode, type PickupConfirmation } from "@/lib/marketplace-pickup-confirmation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** The customer-only code surface; vendors receive only verification results. */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const orderId = new URL(request.url).searchParams.get("orderId") || "";
    if (!orderId) return NextResponse.json({ error: "Order is required." }, { status: 400 });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Pickup confirmation is unavailable." }, { status: 503 });
    const { data: order } = await db.from("orders").select("id, fulfilment_method, customer_id, payment_status, status, pickup_address").eq("id", orderId).eq("customer_id", user.id).maybeSingle<{ id: string; fulfilment_method?: string | null; payment_status?: string | null; status?: string | null; pickup_address?: string | null }>();
    if (!order || order.fulfilment_method !== "PICKUP") return NextResponse.json({ error: "Pickup order not found." }, { status: 404 });
    if (order.payment_status !== "paid" || ["cancelled", "refunded", "delivered"].includes(String(order.status))) return NextResponse.json({ error: "A pickup code is not available for this order." }, { status: 409 });
    const { data: confirmation, error } = await db.from("marketplace_pickup_confirmations").select("order_id, code_digest, code_ciphertext, status, attempts, max_attempts, expires_at").eq("order_id", order.id).maybeSingle<PickupConfirmation>();
    if (error) throw error;
    if (confirmation && marketplacePickupCodeExpired(confirmation)) return NextResponse.json({ error: "This pickup code has expired. Contact support for a replacement." }, { status: 409 });
    const code = confirmation ? revealMarketplacePickupCode(confirmation) : null;
    if (!code) return NextResponse.json({ error: "Pickup code is unavailable. Contact support." }, { status: 409 });
    return NextResponse.json({ code, status: order.status, pickupAddress: order.pickup_address || null, lifecycle: ["Payment Confirmed", "Vendor Preparing", "Ready for Pickup", "Collected"] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load pickup code." }, { status: 500 });
  }
}
