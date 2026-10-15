import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type CancelPayload = { deliveryId?: string };

/**
 * Customers may withdraw an unpaid rider-first request while it is still
 * being offered. Once a rider has accepted, payment, expiry, and release are
 * deliberately handled by the reservation workflow instead.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to cancel this delivery." }, { status: 401 });

    const payload = (await request.json().catch(() => ({}))) as CancelPayload;
    const deliveryId = String(payload.deliveryId || "").trim();
    if (!deliveryId) return NextResponse.json({ error: "Delivery is required." }, { status: 400 });

    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Cancellation is temporarily unavailable. Please try again." }, { status: 503 });

    // This conditional update is the concurrency gate: a rider acceptance
    // that commits first adds rider_id, and this request then changes nothing.
    const { data: cancelled, error } = await db
      .from("deliveries")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", deliveryId)
      .eq("customer_id", user.id)
      .eq("status", "searching")
      .is("rider_id", null)
      .contains("metadata", { rider_payment_reservation: true })
      .select("id, delivery_code")
      .maybeSingle<{ id: string; delivery_code: string }>();
    if (error) throw error;

    if (!cancelled) {
      return NextResponse.json({
        error: "This delivery can no longer be cancelled here. It may already have a rider or payment in progress."
      }, { status: 409 });
    }

    await db.from("delivery_events").insert({
      delivery_id: cancelled.id,
      actor_id: user.id,
      status: "cancelled",
      title: "Delivery cancelled by customer",
      body: "The request was withdrawn before a rider accepted it."
    });

    return NextResponse.json({ deliveryId: cancelled.id, deliveryCode: cancelled.delivery_code, status: "cancelled" });
  } catch {
    return NextResponse.json({ error: "Could not cancel this delivery. Please try again." }, { status: 500 });
  }
}
