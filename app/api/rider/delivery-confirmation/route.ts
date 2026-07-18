import { NextResponse } from "next/server";
import {
  deliveryConfirmationExpired,
  loadDeliveryConfirmation,
  normalizeDeliveryPin,
  verifyDeliveryPin
} from "@/lib/delivery-confirmation";
import { finalizeConfirmedDelivery, type DeliveryForCompletion } from "@/lib/delivery-completion";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { creditRiderDeliveryWallet } from "@/lib/wallet-ledger";

const riderJobSelect =
  "id, delivery_code, pickup_address, pickup_latitude, pickup_longitude, pickup_contact, dropoff_address, dropoff_contact, status, price_ngn, distance_km, eta_minutes, created_at, proof_url, rider_id, vehicle_type, metadata, users:users!deliveries_customer_id_fkey(full_name, phone, email, avatar_url)";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in as the assigned rider." }, { status: 401 });
    const limited = await enforceRateLimit(request, rateLimitPolicies.riderDeliveryConfirmation);
    if (limited) return limited;
    const payload = (await request.json().catch(() => ({}))) as { deliveryId?: string; code?: string };
    const deliveryId = String(payload.deliveryId || "").trim();
    const code = normalizeDeliveryPin(payload.code);
    if (!deliveryId || code.length !== 6) return NextResponse.json({ error: "Enter the six-digit delivery PIN." }, { status: 400 });

    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Delivery confirmation is not configured." }, { status: 503 });
    const { data: rider, error: riderError } = await db.from("rider_profiles").select("id").eq("user_id", user.id).maybeSingle<{ id: string }>();
    if (riderError) throw riderError;
    if (!rider?.id) return NextResponse.json({ error: "Rider profile not found." }, { status: 404 });

    const { data: delivery, error: deliveryError } = await db
      .from("deliveries")
      .select("id, delivery_code, customer_id, rider_id, dropoff_contact, status, metadata")
      .eq("id", deliveryId)
      .maybeSingle<DeliveryForCompletion>();
    if (deliveryError) throw deliveryError;
    if (!delivery?.id) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    if (delivery.rider_id !== rider.id) return NextResponse.json({ error: "Only the assigned rider can verify this delivery PIN." }, { status: 403 });
    if (delivery.status === "delivered") {
      const settlement = await creditRiderDeliveryWallet(db, delivery.id);
      return completedResponse(db, delivery.id, settlement);
    }
    if (delivery.status !== "awaiting_delivery_confirmation") {
      return NextResponse.json({ error: "Mark arrival at the drop-off point before entering the PIN." }, { status: 409 });
    }

    const confirmation = await loadDeliveryConfirmation(db, delivery.id);
    if (!confirmation) return NextResponse.json({ error: "Delivery PIN is not ready. Ask the customer to request a new PIN." }, { status: 409 });
    if (deliveryConfirmationExpired(confirmation)) {
      await db.from("delivery_confirmations").update({ status: "expired", updated_at: new Date().toISOString() }).eq("delivery_id", delivery.id).eq("status", "pending");
      return NextResponse.json({ error: "This delivery PIN has expired. Ask the customer to request a new PIN." }, { status: 410 });
    }
    if (confirmation.status === "locked" || confirmation.attempts >= confirmation.max_attempts) {
      return NextResponse.json({ error: "PIN entry is locked. Contact support to complete this delivery." }, { status: 423 });
    }

    if (!verifyDeliveryPin(code, confirmation)) {
      const attempts = Number(confirmation.attempts || 0) + 1;
      const locked = attempts >= Number(confirmation.max_attempts || 5);
      await db
        .from("delivery_confirmations")
        .update({ attempts, status: locked ? "locked" : "pending", updated_at: new Date().toISOString() })
        .eq("delivery_id", delivery.id)
        .eq("attempts", confirmation.attempts);
      return NextResponse.json(
        { error: locked ? "PIN entry is locked. Contact support to complete this delivery." : "That PIN is incorrect.", attemptsRemaining: Math.max(0, confirmation.max_attempts - attempts) },
        { status: locked ? 423 : 400 }
      );
    }

    const result = await finalizeConfirmedDelivery(db, delivery, user.id, "delivery_pin");
    return completedResponse(db, delivery.id, result.settlement, result.deliveredAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { error: /not configured/i.test(message) ? "Delivery confirmation is not configured." : "Could not verify delivery PIN." },
      { status: /not configured/i.test(message) ? 503 : 500 }
    );
  }
}

async function completedResponse(db: NonNullable<ReturnType<typeof createAdminClient>>, deliveryId: string, settlement: { credited: boolean; amount: number; error?: string }, deliveredAt?: string) {
  const { data: job, error } = await db.from("deliveries").select(riderJobSelect).eq("id", deliveryId).single();
  if (error) throw error;
  return NextResponse.json({ status: "delivered", deliveredAt: deliveredAt || null, settlement, job });
}
