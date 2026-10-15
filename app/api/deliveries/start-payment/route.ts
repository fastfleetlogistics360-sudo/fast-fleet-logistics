import { NextResponse } from "next/server";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { addPaymentReturnToken } from "@/lib/payments/payment-return";
import { createPaymentIntent, markPaymentIntentInitializationFailed, markPaymentIntentPending, type PaymentIntentPurpose } from "@/lib/payments/payment-intents";
import { generatePaymentReference, initiateSquadPayment, paymentChannelsFor } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountTrackingHref } from "@/lib/tracking-links";

type StartPaymentPayload = { deliveryId?: string; matchToken?: string; nativeCheckout?: boolean };

/**
 * Opens the already-priced Squad checkout only after an accepted rider has a
 * live reservation. This endpoint never returns rider contact information.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before completing payment." }, { status: 401 });
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentCreate, name: "deliveries:start-payment" });
    if (limited) return limited;
    const payload = (await request.json().catch(() => ({}))) as StartPaymentPayload;
    const deliveryId = String(payload.deliveryId || "");
    if (!deliveryId) return NextResponse.json({ error: "Delivery is required." }, { status: 400 });

    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Secure payment checkout is temporarily unavailable. Please try again." }, { status: 503 });
    const { data: delivery, error: deliveryError } = await db
      .from("deliveries")
      .select("id, delivery_code, customer_id, rider_id, status, price_ngn, metadata")
      .eq("id", deliveryId)
      .eq("customer_id", user.id)
      .maybeSingle<{
        id: string; delivery_code: string; customer_id: string; rider_id?: string | null; status: string;
        price_ngn: number | string; metadata?: Record<string, unknown> | null;
      }>();
    if (deliveryError) throw deliveryError;
    if (!delivery) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    if (delivery.metadata?.rider_payment_reservation !== true || delivery.status !== "awaiting_customer_payment" || !delivery.rider_id) {
      return NextResponse.json({ error: "A current rider acceptance is required before payment can begin." }, { status: 409 });
    }
    if (payload.matchToken && payload.matchToken !== String(delivery.metadata?.customer_match_token || "")) {
      return NextResponse.json({ error: "Delivery session has expired. Reopen the delivery from your account." }, { status: 403 });
    }

    const { data: reservation, error: reservationError } = await db
      .from("delivery_payment_reservations")
      .select("delivery_id, rider_profile_id, status, expires_at")
      .eq("delivery_id", delivery.id)
      .maybeSingle<{ delivery_id: string; rider_profile_id: string; status: string; expires_at: string }>();
    if (reservationError) throw reservationError;
    if (!reservation || reservation.rider_profile_id !== delivery.rider_id || reservation.status !== "reserved" || new Date(reservation.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This rider reservation has expired. Search for another rider before paying." }, { status: 409 });
    }

    const { data: existingIntent, error: intentLookupError } = await db
      .from("payment_intents")
      .select("id, status")
      .eq("delivery_id", delivery.id)
      .eq("purpose", "delivery_payment")
      .maybeSingle<{ id: string; status: string }>();
    if (intentLookupError) throw intentLookupError;
    if (existingIntent) {
      return NextResponse.json({ error: existingIntent.status === "settled" ? "This delivery has already been paid." : "A secure checkout has already been started for this delivery. Complete it or wait for the reservation to expire." }, { status: 409 });
    }

    const { data: profile } = await supabase.from("users").select("email, full_name").eq("id", user.id).maybeSingle<{ email?: string | null; full_name?: string | null }>();
    const email = user.email || profile?.email || "";
    if (!email.includes("@")) return NextResponse.json({ error: "Add an email address to your account before Squad checkout." }, { status: 400 });
    const paymentMethod = String(delivery.metadata?.payment_choice || "card");
    if (paymentMethod !== "card" && paymentMethod !== "transfer") return NextResponse.json({ error: "This delivery cannot be paid through Squad checkout." }, { status: 409 });

    const reference = generatePaymentReference("FFD");
    const paymentPurpose: PaymentIntentPurpose = delivery.metadata?.source === "fastfleet_marketplace"
      ? "marketplace_delivery_payment"
      : "delivery_payment";
    let paymentIntent;
    try {
      paymentIntent = await createPaymentIntent(db, {
        reference,
        internalReference: `delivery:${delivery.id}`,
        purpose: paymentPurpose,
        ownerUserId: user.id,
        amountNgn: Number(delivery.price_ngn),
        deliveryId: delivery.id
      });
    } catch {
      // The unique delivery internal reference is the server-side duplicate
      // initiation gate; never create a second chargeable checkout.
      return NextResponse.json({ error: "A secure checkout has already been started for this delivery." }, { status: 409 });
    }

    // Persist the exact intent reference before handing the customer to Squad.
    // If Squad reports a very late success after an initialization timeout,
    // the signed callback can still route it to the server-side review path.
    const { data: referenceSaved, error: referenceError } = await db
      .from("deliveries")
      .update({ metadata: { ...delivery.metadata, provider_reference: reference }, updated_at: new Date().toISOString() })
      .eq("id", delivery.id)
      .eq("status", "awaiting_customer_payment")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (referenceError || !referenceSaved) {
      await markPaymentIntentInitializationFailed(db, paymentIntent.id).catch(() => undefined);
      return NextResponse.json({ error: "The rider reservation expired before checkout could start. No payment was collected." }, { status: 409 });
    }

    const siteUrl = paymentCallbackOrigin(request);
    const callbackUrl = new URL(`${siteUrl}/delivery/callback`);
    callbackUrl.searchParams.set("reference", reference);
    callbackUrl.searchParams.set("code", delivery.delivery_code);
    callbackUrl.searchParams.set("deliveryId", delivery.id);
    callbackUrl.searchParams.set("matchToken", String(delivery.metadata?.customer_match_token || ""));
    callbackUrl.searchParams.set("returnTo", accountTrackingHref(delivery.delivery_code));
    if (payload.nativeCheckout === true) callbackUrl.searchParams.set("nativeReturn", "1");
    addPaymentReturnToken(callbackUrl, reference);

    let squadCheckout;
    try {
      squadCheckout = await initiateSquadPayment({
        amountNgn: Number(delivery.price_ngn),
        email,
        reference,
        callbackUrl: callbackUrl.toString(),
        customerName: profile?.full_name || null,
        channels: paymentChannelsFor(paymentMethod),
        metadata: { purpose: paymentPurpose, delivery_code: delivery.delivery_code, payment_method: paymentMethod, rider_first: true }
      });
    } catch {
      await markPaymentIntentInitializationFailed(db, paymentIntent.id).catch(() => undefined);
      return NextResponse.json({ error: "Payment checkout could not start. Your rider reservation remains active until it expires." }, { status: 502 });
    }

    // Flip only after Squad has accepted the request. Expiry continues to own
    // the reservation clock and safely handles an abandoned checkout.
    const { data: activated, error: activationError } = await db
      .from("deliveries")
      .update({ status: "searching", metadata: { ...delivery.metadata, payment_checkout_started_at: new Date().toISOString(), provider_reference: reference }, updated_at: new Date().toISOString() })
      .eq("id", delivery.id)
      .eq("status", "awaiting_customer_payment")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (activationError || !activated) {
      await markPaymentIntentInitializationFailed(db, paymentIntent.id).catch(() => undefined);
      return NextResponse.json({ error: "The rider reservation expired before checkout could start. No payment was collected." }, { status: 409 });
    }
    await markPaymentIntentPending(db, paymentIntent.id).catch(() => undefined);
    return NextResponse.json({ reference: squadCheckout.reference, authorizationUrl: squadCheckout.authorizationUrl, expiresAt: reservation.expires_at });
  } catch {
    return NextResponse.json({ error: "Payment checkout could not start." }, { status: 500 });
  }
}
