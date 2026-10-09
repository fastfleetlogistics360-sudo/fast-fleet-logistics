import { NextRequest, NextResponse } from "next/server";
import { loadPaymentIntent } from "@/lib/payments/payment-intents";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The one safe destination for Squad's account-wide Redirect URL. It never
 * settles a payment itself: it only lets the signed-in owner return to the
 * purpose-specific callback, which then performs normal verification.
 */
export async function GET(request: NextRequest) {
  const reference = paymentReference(request);
  if (!reference) return response({ error: "Missing payment reference." }, 400);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return response({ error: "Please sign in to finish this payment." }, 401);

  const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentVerify, name: "payments:return" });
  if (limited) return limited;

  const db = createAdminClient();
  if (!db) return response({ error: "Payment return is temporarily unavailable." }, 503);

  const intent = await loadPaymentIntent(db, reference).catch(() => null);
  if (!intent || intent.owner_user_id !== user.id) return response({ error: "Payment was not found." }, 404);

  if (intent.purpose === "wallet_funding") {
    return response({ destination: `/wallet/callback?reference=${encodeURIComponent(reference)}` });
  }

  if ((intent.purpose === "delivery_payment" || intent.purpose === "marketplace_delivery_payment") && intent.delivery_id) {
    const { data: delivery } = await db
      .from("deliveries")
      .select("id, delivery_code, customer_id")
      .eq("id", intent.delivery_id)
      .maybeSingle<{ id: string; delivery_code: string; customer_id: string | null }>();
    if (!delivery?.id || delivery.customer_id !== user.id) return response({ error: "Delivery was not found." }, 404);
    const params = new URLSearchParams({ reference, deliveryId: delivery.id, code: delivery.delivery_code });
    return response({ destination: `/delivery/callback?${params.toString()}` });
  }

  if (intent.purpose === "marketplace_business_order" && intent.order_id) {
    return response({ destination: `/marketplace/callback?reference=${encodeURIComponent(reference)}&code=${encodeURIComponent(reference)}` });
  }

  return response({ error: "This payment cannot be routed automatically." }, 409);
}

function paymentReference(request: NextRequest) {
  return request.nextUrl.searchParams.get("reference") || request.nextUrl.searchParams.get("transaction_ref") || request.nextUrl.searchParams.get("TransactionRef") || request.nextUrl.searchParams.get("trxref") || "";
}

function response(body: Record<string, unknown>, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store, private, max-age=0");
  return result;
}
