import { NextRequest, NextResponse } from "next/server";
import { resolveSquadAccount } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, rateLimitPolicies.accountLookup);
    if (limited) return limited;

    const bankCode = request.nextUrl.searchParams.get("bankCode") || "";
    const accountNumber = request.nextUrl.searchParams.get("accountNumber") || "";

    if (!bankCode || !/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({ error: "Select a bank and enter a valid 10-digit account number." }, { status: 400 });
    }

    const account = await resolveSquadAccount(bankCode, accountNumber);
    if (!account.accountName) {
      return NextResponse.json({ error: "Squad could not verify this account." }, { status: 502 });
    }

    return NextResponse.json(account);
  } catch (error) {
    if (isAccountLookupUnavailable(error)) {
      return NextResponse.json(
        {
          code: "account_lookup_unavailable",
          error: "Auto verification is unavailable. Enter the account name exactly as shown in your bank app."
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Account verification failed." }, { status: 500 });
  }
}

function isAccountLookupUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /merchant not eligible|not eligible to use this endpoint|account lookup.*unavailable/i.test(message);
}
