import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify";

export async function GET(request: NextRequest) {
  try {
    const reference = request.nextUrl.searchParams.get("reference");
    if (!reference) {
      return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });
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
      return NextResponse.json({ error: "Please sign in to verify wallet funding." }, { status: 401 });
    }

    const paystackResponse = await fetch(`${PAYSTACK_VERIFY_URL}/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`
      }
    });
    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      return NextResponse.json({ error: paystackData.message || "Paystack verification failed." }, { status: 502 });
    }

    if (paystackData.data.status !== "success") {
      await supabase.rpc("mark_wallet_funding_failed", {
        next_provider_reference: reference,
        next_metadata: {
          paystack_id: paystackData.data.id,
          paystack_status: paystackData.data.status,
          gateway_response: paystackData.data.gateway_response,
          channel: paystackData.data.channel,
          currency: paystackData.data.currency
        }
      });
      return NextResponse.json({ error: `Payment status is ${paystackData.data.status}.` }, { status: 400 });
    }

    const amountNgn = Number(paystackData.data.amount) / 100;
    const { data: walletId, error } = await supabase.rpc("complete_wallet_funding", {
      next_provider_reference: reference,
      next_amount_ngn: amountNgn,
      next_metadata: {
        paystack_id: paystackData.data.id,
        paid_at: paystackData.data.paid_at,
        channel: paystackData.data.channel,
        currency: paystackData.data.currency,
        gateway_response: paystackData.data.gateway_response
      }
    });

    if (error) throw error;

    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance_ngn, locked_balance_ngn, wallet_type")
      .eq("id", walletId)
      .maybeSingle();

    return NextResponse.json({
      reference,
      amount: amountNgn,
      status: "successful",
      balance: wallet?.balance_ngn ?? null,
      lockedBalance: wallet?.locked_balance_ngn ?? null,
      walletType: wallet?.wallet_type ?? null
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Wallet verification failed." }, { status: 500 });
  }
}
