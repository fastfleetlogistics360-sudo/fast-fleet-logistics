import { NextRequest, NextResponse } from "next/server";
import { ensureLegacyMarketplacePaymentIntent } from "@/lib/payments/legacy-payment-intents";
import { loadPaymentIntent } from "@/lib/payments/payment-intents";
import { settleSquadPayment, PaymentSettlementError } from "@/lib/payments/settlement";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const reference = paymentReference(request);
    if (!reference) return response({ error: "Missing payment reference." }, 400);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return response({ error: "Please sign in to verify this marketplace payment." }, 401);
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentVerify, name: "marketplace:verify" });
    if (limited) return limited;
    const db = createAdminClient();
    if (!db) return response({ error: "Secure payment verification is temporarily unavailable." }, 503);

    const intent = (await loadPaymentIntent(db, reference)) || await ensureLegacyMarketplacePaymentIntent(db, { reference, ownerUserId: user.id });
    if (!intent) return response({ error: "Marketplace payment was not found." }, 404);

    const result = await settleSquadPayment(db, { reference, actor: { type: "customer", userId: user.id } });
    return resultResponse(result, reference);
  } catch (error) {
    const status = error instanceof PaymentSettlementError ? 503 : 500;
    return response({ error: status === 503 ? "Payment verification is temporarily unavailable." : "Marketplace payment verification failed." }, status);
  }
}

function paymentReference(request: NextRequest) {
  return request.nextUrl.searchParams.get("reference") || request.nextUrl.searchParams.get("transaction_ref") || request.nextUrl.searchParams.get("TransactionRef") || request.nextUrl.searchParams.get("trxref") || "";
}

function resultResponse(result: Awaited<ReturnType<typeof settleSquadPayment>>, reference: string) {
  if (result.status === "settled" || result.status === "already_settled") {
    return response({
      kind: result.purpose === "marketplace_business_order" ? "business_order" : "marketplace_delivery",
      orderId: result.orderId || null,
      deliveryId: result.deliveryId || null,
      orderCode: reference,
      amount: result.amountNgn,
      status: "successful"
    }, 200);
  }
  if (result.status === "pending" || result.status === "retryable") {
    return response({ reference, status: "pending", message: "Payment is still being confirmed." }, result.status === "pending" ? 202 : 503);
  }
  if (result.status === "forbidden") return response({ error: "Payment verification is not allowed." }, 403);
  if (result.status === "not_found") return response({ error: "Marketplace payment was not found." }, 404);
  return response({ error: "This payment could not be confirmed. Contact support if you were charged." }, 409);
}

function response(body: Record<string, unknown>, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
