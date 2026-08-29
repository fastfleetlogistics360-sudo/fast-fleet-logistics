import { NextResponse } from "next/server";
import { loadPaymentIntent } from "@/lib/payments/payment-intents";
import { PaymentSettlementError, settleSquadPayment } from "@/lib/payments/settlement";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWhatsAppPaymentReturnToken, whatsappConversationUrl } from "@/lib/whatsapp/payment-return";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const reference = String(url.searchParams.get("reference") || "").trim();
    const token = url.searchParams.get("token");
    if (!reference || !verifyWhatsAppPaymentReturnToken(reference, token)) {
      return response({ error: "This payment return link is invalid or has expired." }, 403);
    }
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentVerify, name: "whatsapp:payment-status" });
    if (limited) return limited;
    const db = createAdminClient();
    if (!db) return response({ error: "Payment confirmation is temporarily unavailable." }, 503);
    const intent = await loadPaymentIntent(db, reference);
    if (!intent || !(await isWhatsAppOrder(db, intent.delivery_id, intent.order_id))) {
      return response({ error: "WhatsApp payment not found." }, 404);
    }

    const result = await settleSquadPayment(db, { reference, actor: { type: "reconciliation" } });
    if (result.status === "settled" || result.status === "already_settled") {
      return response({ status: "successful", code: await orderCode(db, intent.delivery_id, intent.order_id), whatsappUrl: whatsappConversationUrl() }, 200);
    }
    if (result.status === "pending" || result.status === "retryable") {
      return response({ status: "pending", message: "Payment is still being confirmed." }, result.status === "pending" ? 202 : 503);
    }
    return response({ error: "This payment could not be confirmed. Please return to WhatsApp and contact support if you were charged." }, 409);
  } catch (error) {
    const status = error instanceof PaymentSettlementError ? 503 : 500;
    return response({ error: status === 503 ? "Payment confirmation is temporarily unavailable." : "Could not confirm this WhatsApp payment." }, status);
  }
}

async function isWhatsAppOrder(db: NonNullable<ReturnType<typeof createAdminClient>>, deliveryId: string | null, orderId: string | null) {
  if (deliveryId) {
    const { data } = await db.from("deliveries").select("metadata").eq("id", deliveryId).maybeSingle<{ metadata?: Record<string, unknown> | null }>();
    return data?.metadata?.source === "whatsapp_ordering";
  }
  if (orderId) {
    const { data } = await db.from("orders").select("metadata").eq("id", orderId).maybeSingle<{ metadata?: Record<string, unknown> | null }>();
    return data?.metadata?.source === "whatsapp_ordering";
  }
  return false;
}

async function orderCode(db: NonNullable<ReturnType<typeof createAdminClient>>, deliveryId: string | null, orderId: string | null) {
  if (deliveryId) {
    const { data } = await db.from("deliveries").select("delivery_code").eq("id", deliveryId).maybeSingle<{ delivery_code?: string | null }>();
    return data?.delivery_code || null;
  }
  const { data } = await db.from("orders").select("order_code").eq("id", orderId).maybeSingle<{ order_code?: string | null }>();
  return data?.order_code || null;
}

function response(body: Record<string, unknown>, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
