import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { WalletType } from "@/types/domain";

const PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize";

export async function POST(request: Request) {
  try {
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

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY. Add your Paystack secret key to .env.local." }, { status: 500 });
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
      return NextResponse.json({ error: "Add an email address to your account before using Paystack wallet top-up." }, { status: 400 });
    }

    const reference = `FFW-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

    const { error: fundingError } = await supabase.rpc("create_wallet_funding", {
      next_user_id: user.id,
      next_wallet_type: walletType,
      next_amount_ngn: amountNgn,
      next_provider: "paystack",
      next_provider_reference: reference,
      next_metadata: {
        source: "dashboard",
        wallet_type: walletType,
        return_to: safeReturnTo,
        email,
        phone: profile?.phone || user.phone || null,
        full_name: profile?.full_name || null
      }
    });

    if (fundingError) throw fundingError;

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
    const callbackUrl = new URL(`${siteUrl}/wallet/callback`);
    callbackUrl.searchParams.set("returnTo", safeReturnTo);
    callbackUrl.searchParams.set("walletType", walletType);

    const paystackResponse = await fetch(PAYSTACK_INITIALIZE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: Math.round(amountNgn * 100),
        email,
        currency: "NGN",
        reference,
        callback_url: callbackUrl.toString()
      })
    });

    const paystackData = await paystackResponse.json();
    if (!paystackResponse.ok || !paystackData.status) {
      await supabase.rpc("mark_wallet_funding_failed", {
        next_provider_reference: reference,
        next_metadata: {
          paystack_initialize_error: paystackData.message || "Paystack initialization failed"
        }
      });
      return NextResponse.json({ error: paystackData.message || "Paystack could not initialize this payment." }, { status: 502 });
    }

    return NextResponse.json({
      reference,
      authorizationUrl: paystackData.data.authorization_url,
      accessCode: paystackData.data.access_code
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Wallet top-up failed." }, { status: 500 });
  }
}

function sanitizeReturnTo(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value.length > 120 ? fallback : value;
}
