import { NextResponse } from "next/server";
import {
  announceDeliveryConfirmation,
  createDeliveryConfirmation,
  deliveryConfirmationExpired,
  loadDeliveryConfirmation,
  revealDeliveryPin,
  userCanConfirmDelivery,
  type DeliveryConfirmationTarget
} from "@/lib/delivery-confirmation";
import { finalizeConfirmedDelivery, type DeliveryForCompletion } from "@/lib/delivery-completion";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { creditRiderDeliveryWallet } from "@/lib/wallet-ledger";

const confirmationSelect = "id, delivery_code, customer_id, rider_id, dropoff_contact, status, metadata";

export async function GET(request: Request) {
  try {
    const context = await loadAuthorizedDelivery(request);
    if (context instanceof NextResponse) return context;
    const { delivery, db } = context;
    if (delivery.status === "delivered") return noStoreJson({ status: "delivered" });
    if (delivery.status !== "awaiting_delivery_confirmation") {
      return noStoreJson({ status: delivery.status || "pending", error: "Delivery confirmation is not ready yet." }, 409);
    }

    const confirmation = await loadDeliveryConfirmation(db, delivery.id);
    if (!confirmation) return noStoreJson({ status: "missing", error: "Delivery PIN is not ready. Request a new PIN." }, 409);
    if (deliveryConfirmationExpired(confirmation)) {
      await db.from("delivery_confirmations").update({ status: "expired", updated_at: new Date().toISOString() }).eq("delivery_id", delivery.id).eq("status", "pending");
      return noStoreJson({
        status: "expired",
        expiresAt: confirmation.expires_at,
        recipientPhoneLast4: confirmation.recipient_phone_last4 || null
      });
    }

    return noStoreJson({
      status: confirmation.status,
      code: revealDeliveryPin(confirmation),
      expiresAt: confirmation.expires_at,
      lastSentAt: confirmation.last_sent_at,
      sendCount: confirmation.send_count,
      recipientPhoneLast4: confirmation.recipient_phone_last4 || null
    });
  } catch (error) {
    return confirmationError(error, "Could not load delivery confirmation.");
  }
}

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { name: "customer:delivery-confirmation", limit: 12, windowSeconds: 5 * 60 });
    if (limited) return limited;
    const payload = (await request.json().catch(() => ({}))) as { deliveryId?: string; action?: "confirm" | "resend" };
    const deliveryId = String(payload.deliveryId || "").trim();
    const action = payload.action;
    if (!deliveryId || (action !== "confirm" && action !== "resend")) {
      return noStoreJson({ error: "Choose a delivery and confirmation action." }, 400);
    }

    const context = await loadAuthorizedDelivery(request, deliveryId);
    if (context instanceof NextResponse) return context;
    const { delivery, db, userId } = context;
    if (delivery.status === "delivered") {
      const settlement = await creditRiderDeliveryWallet(db, delivery.id);
      return noStoreJson({ status: "delivered", settlement });
    }
    if (delivery.status !== "awaiting_delivery_confirmation") {
      return noStoreJson({ error: "This delivery is not awaiting confirmation." }, 409);
    }

    if (action === "resend") {
      const issued = await createDeliveryConfirmation(db, delivery, { force: true });
      const announcement = await announceDeliveryConfirmation(db, delivery, issued);
      return noStoreJson({
        status: "pending",
        code: issued.code,
        expiresAt: issued.expiresAt,
        sendCount: issued.sendCount,
        recipientPhoneLast4: issued.recipientPhoneLast4,
        smsSent: announcement.smsSent
      });
    }

    const result = await finalizeConfirmedDelivery(db, delivery, userId, "customer_app");
    return noStoreJson({ status: "delivered", deliveredAt: result.deliveredAt, settlement: result.settlement });
  } catch (error) {
    return confirmationError(error, "Could not confirm delivery.");
  }
}

async function loadAuthorizedDelivery(request: Request, bodyDeliveryId?: string) {
  const requestUrl = new URL(request.url);
  const deliveryId = String(bodyDeliveryId || requestUrl.searchParams.get("deliveryId") || "").trim();
  if (!deliveryId) return noStoreJson({ error: "Choose a delivery." }, 400);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return noStoreJson({ error: "Please sign in to confirm this delivery." }, 401);

  const db = createAdminClient();
  if (!db) return noStoreJson({ error: "Delivery confirmation is not configured." }, 503);
  const { data: delivery, error } = await db
    .from("deliveries")
    .select(confirmationSelect)
    .eq("id", deliveryId)
    .maybeSingle<DeliveryForCompletion>();
  if (error) throw error;
  if (!delivery?.id) return noStoreJson({ error: "Delivery not found." }, 404);
  if (!userCanConfirmDelivery(delivery as DeliveryConfirmationTarget, user.id)) {
    return noStoreJson({ error: "Only the booking customer or recipient account can confirm this delivery." }, 403);
  }
  return { delivery, db, userId: user.id };
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, private, max-age=0");
  return response;
}

function confirmationError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/^Wait \d+ seconds/.test(message)) return noStoreJson({ error: message }, 429);
  if (/resend limit|locked/i.test(message)) return noStoreJson({ error: message }, 423);
  if (/not configured/i.test(message)) return noStoreJson({ error: "Delivery confirmation is not configured." }, 503);
  if (/Delivery PIN data is invalid/i.test(message)) return noStoreJson({ error: "Request a new delivery PIN." }, 409);
  return noStoreJson({ error: fallback }, 500);
}
