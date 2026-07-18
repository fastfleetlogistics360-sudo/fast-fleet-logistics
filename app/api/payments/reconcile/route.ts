import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { reconcileSquadPayments } from "@/lib/payments/reconciliation";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) {
    return response({ error: authorization.reason === "misconfigured" ? "Payment reconciliation is not securely configured." : "Payment reconciliation authorization required." }, authorization.reason === "misconfigured" ? 503 : 401);
  }

  const db = createAdminClient();
  if (!db) return response({ error: "Payment reconciliation is not securely configured." }, 503);

  try {
    const summary = await reconcileSquadPayments(db, 20);
    return response({ ok: true, ...summary }, 200);
  } catch {
    return response({ error: "Payment reconciliation could not complete." }, 503);
  }
}

function response(body: Record<string, unknown>, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
