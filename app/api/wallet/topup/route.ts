import { NextResponse } from "next/server";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { createPaymentIntent, markPaymentIntentInitializationFailed, markPaymentIntentPending } from "@/lib/payments/payment-intents";
import { generatePaymentReference, getSquadPaymentEnvironment, initiateSquadPayment } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { WalletType } from "@/types/domain";

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentCreate, name: "wallet:topup" });
    if (limited) return limited;

    const { amount, walletType = "customer", returnTo } = (await request.json()) as {
      amount?: number;
      walletType?: WalletType;
      returnTo?: string;
    };
    const amountNgn = Number(amount);
    const safeReturnTo = sanitizeReturnTo(returnTo, walletType === "rider" ? "/rider/dashboard" : "/dashboard");

    if (!Number.isFinite(amountNgn) || amountNgn < 500) {
      return NextResponse.json({ error: "Enter a wallet top-up amount of at least NGN 500." }, { status: 400 });
    }

    if (walletType !== "customer" && walletType !== "rider") {
      return NextResponse.json({ error: "Only customer and rider wallets can be funded from the dashboard." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Please sign in before funding your wallet." }, { status: 401 });
    }
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Secure wallet funding is temporarily unavailable. Please try again." }, { status: 503 });
    }
    const paymentDb = admin;

    const { data: profile } = await supabase.from("users").select("email, phone, full_name").eq("id", user.id).maybeSingle();
    const email = user.email || profile?.email;

    if (!email) {
      return NextResponse.json({ error: "Add an email address to your account before using Squad wallet top-up." }, { status: 400 });
    }

    const reference = generatePaymentReference("FFW");
    const paymentEnvironment = getSquadPaymentEnvironment();

    const { error: fundingError } = await supabase.rpc("create_wallet_funding", {
      next_user_id: user.id,
      next_wallet_type: walletType,
      next_amount_ngn: amountNgn,
      next_provider: "squad",
      next_provider_reference: reference,
      next_metadata: {
        source: "dashboard",
        payment_environment: paymentEnvironment,
        squad_environment: paymentEnvironment,
        wallet_type: walletType,
        return_to: safeReturnTo
      }
    });

    if (fundingError) throw fundingError;

    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", user.id)
      .eq("wallet_type", walletType)
      .single<{ id: string }>();
    if (walletError || !wallet) throw walletError || new Error("Wallet funding target was not created.");

    let paymentIntent;
    try {
      paymentIntent = await createPaymentIntent(paymentDb, {
        reference,
        internalReference: `wallet-funding:${reference}`,
        purpose: "wallet_funding",
        ownerUserId: user.id,
        amountNgn,
        walletId: wallet.id
      });
    } catch {
      await supabase.rpc("mark_wallet_funding_failed", {
        next_provider_reference: reference,
        next_metadata: { payment_environment: paymentEnvironment, initialization_error: "payment_intent_create_failed" }
      });
      return NextResponse.json({ error: "Secure wallet funding is temporarily unavailable. Please try again." }, { status: 503 });
    }

    const siteUrl = paymentCallbackOrigin(request);
    const callbackUrl = new URL(`${siteUrl}/wallet/callback`);
    callbackUrl.searchParams.set("reference", reference);
    callbackUrl.searchParams.set("returnTo", safeReturnTo);
    callbackUrl.searchParams.set("walletType", walletType);

    try {
      const squadCheckout = await initiateSquadPayment({
        amountNgn,
        email,
        reference,
        callbackUrl: callbackUrl.toString(),
        customerName: profile?.full_name || null,
        metadata: {
          purpose: "wallet_funding"
        }
      });
      return NextResponse.json({
        reference: squadCheckout.reference,
        authorizationUrl: squadCheckout.authorizationUrl
      });
    } catch {
      await markPaymentIntentInitializationFailed(paymentDb, paymentIntent.id).catch(() => undefined);
      await supabase.rpc("mark_wallet_funding_failed", {
        next_provider_reference: reference,
        next_metadata: {
          payment_environment: paymentEnvironment,
          squad_environment: paymentEnvironment,
          squad_initialize_error: "initialization_failed"
        }
      });
      return NextResponse.json({ error: "Wallet payment checkout could not start. Please try again." }, { status: 502 });
    }
    await markPaymentIntentPending(paymentDb, paymentIntent.id).catch(() => undefined);
  } catch {
    return NextResponse.json({ error: "Wallet top-up failed." }, { status: 500 });
  }
}

function sanitizeReturnTo(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value.length > 120 ? fallback : value;
}
