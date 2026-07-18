import { NextRequest, NextResponse } from "next/server";
import { ensureLegacyDeliveryPaymentIntent } from "@/lib/payments/legacy-payment-intents";
import { loadPaymentIntent } from "@/lib/payments/payment-intents";
import { settleSquadPayment, PaymentSettlementError } from "@/lib/payments/settlement";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const reference = paymentReference(request);
    const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase() || "";
    const deliveryId = request.nextUrl.searchParams.get("deliveryId") || "";
    if (!reference || (!code && !deliveryId)) {
      return response({ error: "Missing payment reference or delivery code." }, 400);
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return response({ error: "Please sign in to verify this delivery payment." }, 401);
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentVerify, name: "deliveries:verify" });
    if (limited) return limited;
    const db = createAdminClient();
    if (!db) return response({ error: "Secure payment verification is temporarily unavailable." }, 503);

    let query = db
      .from("deliveries")
      .select("id, delivery_code, customer_id, metadata")
      .eq("customer_id", user.id);
    query = deliveryId ? query.eq("id", deliveryId) : query.eq("delivery_code", code);
    const { data: delivery, error: deliveryError } = await query.maybeSingle<{
      id: string;
      delivery_code: string;
      customer_id: string;
      metadata: Record<string, unknown> | null;
    }>();
    if (deliveryError) throw deliveryError;
    if (!delivery || String((delivery.metadata || {}).provider_reference || "") !== reference) {
      return response({ error: "Delivery not found for this payment." }, 404);
    }

    const intent = (await loadPaymentIntent(db, reference)) || await ensureLegacyDeliveryPaymentIntent(db, {
      reference,
      ownerUserId: user.id,
      deliveryId: delivery.id
    });
    if (!intent || intent.delivery_id !== delivery.id) return response({ error: "Payment intent not found." }, 404);

    const result = await settleSquadPayment(db, { reference, actor: { type: "customer", userId: user.id } });
    return resultResponse(result, { deliveryId: delivery.id, deliveryCode: delivery.delivery_code });
  } catch (error) {
    const status = error instanceof PaymentSettlementError ? 503 : 500;
    return response({ error: status === 503 ? "Payment verification is temporarily unavailable." : "Delivery payment verification failed." }, status);
  }
}

function paymentReference(request: NextRequest) {
  return request.nextUrl.searchParams.get("reference") || request.nextUrl.searchParams.get("transaction_ref") || request.nextUrl.searchParams.get("TransactionRef") || request.nextUrl.searchParams.get("trxref") || "";
}

function resultResponse(
  result: Awaited<ReturnType<typeof settleSquadPayment>>,
  delivery: { deliveryId: string; deliveryCode: string }
) {
  if (result.status === "settled" || result.status === "already_settled") {
    return response({ ...delivery, amount: result.amountNgn, status: "successful" }, 200);
  }
  if (result.status === "pending" || result.status === "retryable") {
    return response({ ...delivery, status: "pending", message: "Payment is still being confirmed." }, result.status === "pending" ? 202 : 503);
  }
  if (result.status === "forbidden") return response({ error: "Payment verification is not allowed." }, 403);
  if (result.status === "not_found") return response({ error: "Payment intent not found." }, 404);
  return response({ error: "This payment could not be confirmed. Contact support if you were charged." }, 409);
}

function response(body: Record<string, unknown>, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
