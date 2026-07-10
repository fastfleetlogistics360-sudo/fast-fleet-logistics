import { NextResponse } from "next/server";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { generatePaymentReference, getSquadPaymentEnvironment, initiateSquadPayment } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
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
        return_to: safeReturnTo,
        email,
        phone: profile?.phone || user.phone || null,
        full_name: profile?.full_name || null
      }
    });

    if (fundingError) throw fundingError;

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
          source: "wallet_topup",
          payment_environment: paymentEnvironment,
          squad_environment: paymentEnvironment,
          wallet_type: walletType,
          user_id: user.id
        }
      });
      return NextResponse.json({
        reference: squadCheckout.reference,
        authorizationUrl: squadCheckout.authorizationUrl,
        accessCode: squadCheckout.accessCode
      });
    } catch (error) {
      await supabase.rpc("mark_wallet_funding_failed", {
        next_provider_reference: reference,
        next_metadata: {
          payment_environment: paymentEnvironment,
          squad_environment: paymentEnvironment,
          squad_initialize_error: error instanceof Error ? error.message : "Squad initialization failed"
        }
      });
      return NextResponse.json({ error: error instanceof Error ? error.message : "Squad could not initialize this payment." }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Wallet top-up failed." }, { status: 500 });
  }
}

function sanitizeReturnTo(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value.length > 120 ? fallback : value;
}
