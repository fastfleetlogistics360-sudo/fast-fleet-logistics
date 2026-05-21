import { NextResponse } from "next/server";
import { PLATFORM_CHECKOUT_FEE_NGN } from "@/lib/fare";

const PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize";
const DELIVERY_FEE_NGN = 1000;

type CheckoutItem = {
  name: string;
  store: string;
  quantity: number;
  price: number;
  subtotal: number;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      kind?: "restaurant" | "shopping";
      email?: string;
      phone?: string;
      address?: string;
      amount?: number;
      items?: CheckoutItem[];
    };

    const items = Array.isArray(payload.items) ? payload.items : [];
    const itemsTotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const expectedAmount = itemsTotal + PLATFORM_CHECKOUT_FEE_NGN + DELIVERY_FEE_NGN;

    if (!payload.email || !payload.email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address for Paystack checkout." }, { status: 400 });
    }
    if (!items.length || expectedAmount < 1200) {
      return NextResponse.json({ error: "Add at least one item before checkout." }, { status: 400 });
    }
    if (Number(payload.amount) !== expectedAmount) {
      return NextResponse.json({ error: "Checkout total changed. Refresh and try again." }, { status: 400 });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY. Add it on Vercel before live marketplace checkout." }, { status: 500 });
    }

    const reference = `FFM-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
    const callbackUrl = new URL(`${siteUrl}/${payload.kind === "shopping" ? "shopping-mall" : "restaurants"}`);
    callbackUrl.searchParams.set("paid", "1");
    callbackUrl.searchParams.set("reference", reference);

    const response = await fetch(PAYSTACK_INITIALIZE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: Math.round(expectedAmount * 100),
        email: payload.email,
        currency: "NGN",
        reference,
        callback_url: callbackUrl.toString(),
        metadata: {
          source: "fastfleet_marketplace",
          kind: payload.kind,
          phone: payload.phone || null,
          delivery_address: payload.address || null,
          platform_fee_ngn: PLATFORM_CHECKOUT_FEE_NGN,
          delivery_fee_ngn: DELIVERY_FEE_NGN,
          items
        }
      })
    });
    const paystackData = await response.json();

    if (!response.ok || !paystackData.status) {
      return NextResponse.json({ error: paystackData.message || "Paystack could not initialize checkout." }, { status: 502 });
    }

    return NextResponse.json({
      reference,
      authorizationUrl: paystackData.data.authorization_url,
      accessCode: paystackData.data.access_code
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Marketplace checkout failed." }, { status: 500 });
  }
}
