import { NextRequest, NextResponse } from "next/server";
import { loadPaymentIntent } from "@/lib/payments/payment-intents";
import { settleSquadPayment } from "@/lib/payments/settlement";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference") || "";
  if (!reference) return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to verify this FastErrand." }, { status: 401 });
  const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentVerify, name: "fast-errands:verify" });
  if (limited) return limited;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "FastErrands verification is temporarily unavailable." }, { status: 503 });
  const intent = await loadPaymentIntent(db, reference);
  if (!intent || intent.purpose !== "delivery_payment" || !intent.internal_reference.startsWith("fast-errand:")) return NextResponse.json({ error: "FastErrands payment was not found." }, { status: 404 });
  const result = await settleSquadPayment(db, { reference, actor: { type: "customer", userId: user.id } });
  if (result.status === "settled" || result.status === "already_settled") return NextResponse.json({ status: "successful", amount: result.amountNgn, errandCode: request.nextUrl.searchParams.get("code") || null });
  if (result.status === "pending" || result.status === "retryable") return NextResponse.json({ status: "pending", message: "Squad is still confirming your FastErrands payment." }, { status: result.status === "pending" ? 202 : 503 });
  return NextResponse.json({ error: "This FastErrands payment could not be confirmed." }, { status: 409 });
}
