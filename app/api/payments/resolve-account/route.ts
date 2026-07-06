import { NextRequest, NextResponse } from "next/server";
import { resolveSquadAccount } from "@/lib/payments/squad";

export async function GET(request: NextRequest) {
  try {
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Account verification failed." }, { status: 500 });
  }
}
