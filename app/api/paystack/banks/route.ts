import { NextResponse } from "next/server";

const PAYSTACK_BANKS_URL = "https://api.paystack.co/bank?country=nigeria&perPage=100";

export async function GET() {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ banks: fallbackBanks });
    }

    const response = await fetch(PAYSTACK_BANKS_URL, {
      headers: { Authorization: `Bearer ${secretKey}` },
      next: { revalidate: 60 * 60 * 24 }
    });
    const payload = await response.json();

    if (!response.ok || !payload.status) {
      return NextResponse.json({ banks: fallbackBanks });
    }

    return NextResponse.json({
      banks: payload.data.map((bank: { name: string; code: string }) => ({ name: bank.name, code: bank.code }))
    });
  } catch {
    return NextResponse.json({ banks: fallbackBanks });
  }
}

const fallbackBanks = [
  { name: "Access Bank", code: "044" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "Kuda Bank", code: "50211" },
  { name: "Moniepoint MFB", code: "50515" },
  { name: "Opay", code: "999992" },
  { name: "PalmPay", code: "999991" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "United Bank For Africa", code: "033" },
  { name: "Zenith Bank", code: "057" }
];
