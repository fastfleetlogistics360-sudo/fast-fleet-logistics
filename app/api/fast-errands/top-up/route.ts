import { NextResponse } from "next/server";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { createPaymentIntent, markPaymentIntentInitializationFailed, markPaymentIntentPending } from "@/lib/payments/payment-intents";
import { generatePaymentReference, initiateSquadPayment } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to approve the FastErrands top-up." }, { status: 401 });
  const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentCreate, name: "fast-errands:top-up" });
  if (limited) return limited;
  const errandId = String((await request.json().catch(() => ({})) as Record<string, unknown>).errandId || "").trim();
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "FastErrands top-up is temporarily unavailable." }, { status: 503 });
  const { data: errand } = await db.from("fast_errand_orders").select("id, errand_code, top_up_required_ngn, status").eq("id", errandId).eq("customer_id", user.id).maybeSingle<{ id: string; errand_code: string; top_up_required_ngn: number; status: string }>();
  const amount = Math.round(Number(errand?.top_up_required_ngn || 0));
  if (!errand || errand.status !== "top_up_required" || amount < 1) return NextResponse.json({ error: "This FastErrand does not need a customer top-up." }, { status: 409 });
  const email = user.email || "";
  if (!email.includes("@")) return NextResponse.json({ error: "Add an email address to your account before paying the top-up." }, { status: 400 });
  const { data: wallet, error: walletError } = await db.from("wallets").upsert({ user_id: user.id, wallet_type: "customer" }, { onConflict: "user_id,wallet_type" }).select("id").single<{ id: string }>();
  if (walletError || !wallet) return NextResponse.json({ error: "Could not prepare your protected purchase balance." }, { status: 500 });
  const reference = generatePaymentReference("FET");
  const { error: transactionError } = await db.from("transactions").insert({ wallet_id: wallet.id, transaction_type: "wallet_funding", amount_ngn: amount, status: "pending", provider: "squad", provider_reference: reference, metadata: { fast_errand_id: errand.id, fast_errand_top_up: true, errand_code: errand.errand_code } });
  if (transactionError) return NextResponse.json({ error: "Could not prepare the top-up." }, { status: 500 });
  let intent;
  try { intent = await createPaymentIntent(db, { reference, internalReference: `fast-errand-top-up:${errand.id}:${reference}`, purpose: "wallet_funding", ownerUserId: user.id, amountNgn: amount, walletId: wallet.id }); }
  catch { return NextResponse.json({ error: "Could not prepare the secure top-up." }, { status: 503 }); }
  const callbackUrl = new URL(`${paymentCallbackOrigin(request)}/wallet/callback`); callbackUrl.searchParams.set("reference", reference); callbackUrl.searchParams.set("returnTo", "/fast-errands");
  try { const checkout = await initiateSquadPayment({ amountNgn: amount, email, reference, callbackUrl: callbackUrl.toString(), customerName: email, metadata: { purpose: "fast_errand_top_up", fast_errand_id: errand.id } }); await markPaymentIntentPending(db, intent.id); return NextResponse.json({ authorizationUrl: checkout.authorizationUrl }); }
  catch { await markPaymentIntentInitializationFailed(db, intent.id).catch(() => undefined); await db.from("transactions").update({ status: "failed" }).eq("provider_reference", reference); return NextResponse.json({ error: "Top-up payment could not start. Your card has not been charged." }, { status: 502 }); }
}
