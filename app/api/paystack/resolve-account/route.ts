import { NextRequest, NextResponse } from "next/server";

const PAYSTACK_RESOLVE_URL = "https://api.paystack.co/bank/resolve";

export async function GET(request: NextRequest) {
  try {
    const bankCode = request.nextUrl.searchParams.get("bankCode") || "";
    const accountNumber = request.nextUrl.searchParams.get("accountNumber") || "";

    if (!bankCode || !/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({ error: "Select a bank and enter a valid 10-digit account number." }, { status: 400 });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: "Add PAYSTACK_SECRET_KEY to verify account names." }, { status: 500 });
    }

    const resolveUrl = new URL(PAYSTACK_RESOLVE_URL);
    resolveUrl.searchParams.set("account_number", accountNumber);
    resolveUrl.searchParams.set("bank_code", bankCode);

    const response = await fetch(resolveUrl, {
      headers: { Authorization: `Bearer ${secretKey}` },
      cache: "no-store"
    });
    const payload = await response.json();

    if (!response.ok || !payload.status) {
      return NextResponse.json({ error: payload.message || "Paystack could not verify this account." }, { status: 502 });
    }

    return NextResponse.json({
      accountName: payload.data.account_name,
      accountNumber: payload.data.account_number,
      bankId: payload.data.bank_id
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Account verification failed." }, { status: 500 });
  }
}
