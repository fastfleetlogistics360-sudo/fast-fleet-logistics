import { NextResponse } from "next/server";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { addPaymentReturnToken } from "@/lib/payments/payment-return";
import { markPaymentIntentPending } from "@/lib/payments/payment-intents";
import { initiateSquadPayment } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountTrackingHref } from "@/lib/tracking-links";

type ResumePickupPayload = { orderId?: string; nativeCheckout?: boolean };

/** Reopens the original Squad session for an unpaid pickup order. It never
 * creates another payment intent or exposes an order belonging to another user. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before completing payment." }, { status: 401 });
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentCreate, name: "marketplace:start-pickup-payment" });
    if (limited) return limited;

    const payload = (await request.json().catch(() => ({}))) as ResumePickupPayload;
    const orderId = String(payload.orderId || "");
    if (!orderId) return NextResponse.json({ error: "Order is required." }, { status: 400 });

    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Secure payment checkout is temporarily unavailable. Please try again." }, { status: 503 });
    const { data: order, error: orderError } = await db
      .from("orders")
      .select("id, order_code, fulfilment_method, payment_status, status, amount")
      .eq("id", orderId)
      .eq("customer_id", user.id)
      .maybeSingle<{ id: string; order_code: string; fulfilment_method?: string | null; payment_status?: string | null; status?: string | null; amount?: number | string | null }>();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.fulfilment_method !== "PICKUP") return NextResponse.json({ error: "This payment can only be resumed from the applicable order flow." }, { status: 409 });
    if (order.payment_status === "paid") return NextResponse.json({ error: "This order has already been paid." }, { status: 409 });
    if (order.payment_status !== "pending" || ["cancelled", "refunded", "delivered"].includes(String(order.status))) {
      return NextResponse.json({ error: "This pickup order is no longer available for payment." }, { status: 409 });
    }

    const { data: intent, error: intentError } = await db
      .from("payment_intents")
      .select("id, status, provider_transaction_reference")
      .eq("order_id", order.id)
      .eq("purpose", "marketplace_business_order")
      .eq("owner_user_id", user.id)
      .maybeSingle<{ id: string; status: string; provider_transaction_reference: string }>();
    if (intentError) throw intentError;
    if (!intent) return NextResponse.json({ error: "The original payment session is unavailable. Please place a new order." }, { status: 409 });
    if (intent.status === "settled") return NextResponse.json({ error: "This order has already been paid." }, { status: 409 });
    if (!["initialized", "pending"].includes(intent.status)) return NextResponse.json({ error: "This payment session cannot be resumed. Please place a new order." }, { status: 409 });

    const { data: profile } = await supabase.from("users").select("email, full_name").eq("id", user.id).maybeSingle<{ email?: string | null; full_name?: string | null }>();
    const email = user.email || profile?.email || "";
    if (!email.includes("@")) return NextResponse.json({ error: "Add an email address to your account before Squad checkout." }, { status: 400 });

    const callbackUrl = new URL(`${paymentCallbackOrigin(request)}/marketplace/callback`);
    callbackUrl.searchParams.set("reference", intent.provider_transaction_reference);
    callbackUrl.searchParams.set("code", order.order_code);
    callbackUrl.searchParams.set("returnTo", accountTrackingHref(order.order_code));
    if (payload.nativeCheckout === true) callbackUrl.searchParams.set("nativeReturn", "1");
    addPaymentReturnToken(callbackUrl, intent.provider_transaction_reference);

    let checkout;
    try {
      checkout = await initiateSquadPayment({
        amountNgn: Number(order.amount || 0),
        email,
        reference: intent.provider_transaction_reference,
        callbackUrl: callbackUrl.toString(),
        customerName: profile?.full_name || null,
        metadata: { purpose: "marketplace_business_order", internal_reference: `order:${order.id}`, resumed: true }
      });
    } catch {
      return NextResponse.json({ error: "Payment checkout could not be reopened. Your order is still unpaid." }, { status: 502 });
    }

    await markPaymentIntentPending(db, intent.id).catch(() => undefined);
    return NextResponse.json({ reference: checkout.reference, authorizationUrl: checkout.authorizationUrl });
  } catch {
    return NextResponse.json({ error: "Payment checkout could not be reopened." }, { status: 500 });
  }
}
