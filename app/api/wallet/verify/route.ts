import { NextRequest, NextResponse } from "next/server";
import { getSquadPaymentEnvironment, isSuccessfulSquadStatus, verifySquadTransaction } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentVerify, name: "wallet:verify" });
    if (limited) return limited;

    const reference =
      request.nextUrl.searchParams.get("reference") ||
      request.nextUrl.searchParams.get("transaction_ref") ||
      request.nextUrl.searchParams.get("TransactionRef") ||
      request.nextUrl.searchParams.get("trxref");
    if (!reference) {
      return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Please sign in to verify wallet funding." }, { status: 401 });
    }

    const squadTransaction = await verifySquadTransaction(reference);
    const paymentEnvironment = getSquadPaymentEnvironment();

    if (!isSuccessfulSquadStatus(squadTransaction.status)) {
      await supabase.rpc("mark_wallet_funding_failed", {
        next_provider_reference: reference,
        next_metadata: {
          payment_environment: paymentEnvironment,
          squad_environment: paymentEnvironment,
          provider_status: squadTransaction.status,
          gateway_reference: squadTransaction.gatewayReference,
          channel: squadTransaction.channel,
          currency: squadTransaction.currency
        }
      });
      return NextResponse.json({ error: `Payment status is ${squadTransaction.status}.` }, { status: 400 });
    }

    const amountNgn = squadTransaction.amountNgn;
    const { data: walletId, error } = await supabase.rpc("complete_wallet_funding", {
      next_provider_reference: reference,
      next_amount_ngn: amountNgn,
      next_metadata: {
        payment_environment: paymentEnvironment,
        squad_environment: paymentEnvironment,
        paid_at: squadTransaction.paidAt,
        channel: squadTransaction.channel,
        currency: squadTransaction.currency,
        gateway_reference: squadTransaction.gatewayReference,
        squad_raw: squadTransaction.raw
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
