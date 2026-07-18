import { NextRequest, NextResponse } from "next/server";
import { ensureLegacyWalletFundingIntent } from "@/lib/payments/legacy-payment-intents";
import { loadPaymentIntent } from "@/lib/payments/payment-intents";
import { settleSquadPayment, PaymentSettlementError } from "@/lib/payments/settlement";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentVerify, name: "wallet:verify" });
    if (limited) return limited;

    const reference = paymentReference(request);
    if (!reference) return response({ error: "Missing payment reference." }, 400);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return response({ error: "Please sign in to verify wallet funding." }, 401);
    const db = createAdminClient();
    if (!db) return response({ error: "Secure payment verification is temporarily unavailable." }, 503);

    const intent = (await loadPaymentIntent(db, reference)) || await ensureLegacyWalletFundingIntent(db, { reference, ownerUserId: user.id });
    if (!intent || intent.purpose !== "wallet_funding") return response({ error: "Wallet funding was not found." }, 404);

    const result = await settleSquadPayment(db, { reference, actor: { type: "customer", userId: user.id } });
    if (result.status === "settled" || result.status === "already_settled") {
      const { data: wallet } = await db
        .from("wallets")
        .select("balance_ngn, locked_balance_ngn, wallet_type")
        .eq("id", result.walletId || "")
        .maybeSingle<{ balance_ngn: number | null; locked_balance_ngn: number | null; wallet_type: string | null }>();
      return response({
        reference,
        amount: result.amountNgn,
        status: "successful",
        balance: wallet?.balance_ngn ?? null,
        lockedBalance: wallet?.locked_balance_ngn ?? null,
        walletType: wallet?.wallet_type ?? null
      }, 200);
    }
    if (result.status === "pending" || result.status === "retryable") {
      return response({ reference, status: "pending", message: "Payment is still being confirmed." }, result.status === "pending" ? 202 : 503);
    }
    if (result.status === "forbidden") return response({ error: "Payment verification is not allowed." }, 403);
    return response({ error: "This payment could not be confirmed. Contact support if you were charged." }, 409);
  } catch (error) {
    const status = error instanceof PaymentSettlementError ? 503 : 500;
    return response({ error: status === 503 ? "Payment verification is temporarily unavailable." : "Wallet verification failed." }, status);
  }
}

function paymentReference(request: NextRequest) {
  return request.nextUrl.searchParams.get("reference") || request.nextUrl.searchParams.get("transaction_ref") || request.nextUrl.searchParams.get("TransactionRef") || request.nextUrl.searchParams.get("trxref") || "";
}

function response(body: Record<string, unknown>, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
