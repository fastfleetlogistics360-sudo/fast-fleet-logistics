import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { loadPaymentIntent } from "@/lib/payments/payment-intents";
import { settleSquadPayment } from "@/lib/payments/settlement";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return response({ error: "Admin authorization required." }, 401);

  const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentManualReconcile, name: "admin:payment-reconcile" });
  if (limited) {
    limited.headers.set("Cache-Control", "no-store");
    return limited;
  }

  const body = (await request.json().catch(() => null)) as { reference?: unknown } | null;
  const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
  if (!reference) return response({ error: "A payment reference is required." }, 400);

  const db = createAdminClient();
  if (!db) return response({ error: "Payment reconciliation is not securely configured." }, 503);

  try {
    const intent = await loadPaymentIntent(db, reference);
    if (!intent) return response({ error: "Payment intent not found." }, 404);
    const result = await settleSquadPayment(db, { reference, actor: { type: "admin", userId: admin.userId } });
    return response({ status: result.status, code: result.code, reference, purpose: result.purpose || null }, 200);
  } catch {
    return response({ error: "Payment reconciliation could not complete." }, 503);
  }
}

function response(body: Record<string, unknown>, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
