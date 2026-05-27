import { NextResponse } from "next/server";
import { PLATFORM_CHECKOUT_FEE_NGN } from "@/lib/fare";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { createClient } from "@/lib/supabase/server";

const PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize";
const RESTAURANT_DELIVERY_FEE_NGN = 1000;
const MALL_DELIVERY_FEE_NGN = 1500;

type CheckoutItem = {
  name: string;
  store: string;
  quantity: number;
  price: number;
  subtotal: number;
  productId?: string;
  productName?: string;
  mallId?: string;
  mallName?: string;
  vendorId?: string;
  vendorName?: string;
  category?: string;
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
      fees?: {
        platformFee?: number;
        deliveryFee?: number;
      };
    };

    const items = Array.isArray(payload.items) ? payload.items : [];
    const itemsTotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const isShopping = payload.kind === "shopping";
    const platformFee = PLATFORM_CHECKOUT_FEE_NGN;
    const deliveryFee = isShopping ? MALL_DELIVERY_FEE_NGN : RESTAURANT_DELIVERY_FEE_NGN;
    const expectedAmount = itemsTotal + platformFee + deliveryFee;

    if (!payload.email || !payload.email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address for Paystack checkout." }, { status: 400 });
    }
    if (!items.length || expectedAmount < 1200) {
      return NextResponse.json({ error: "Add at least one item before checkout." }, { status: 400 });
    }
    if (Number(payload.amount) !== expectedAmount) {
      return NextResponse.json({ error: "Checkout total changed. Refresh and try again." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before placing this order." }, { status: 401 });

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY. Add it on Vercel before live marketplace checkout." }, { status: 500 });
    }

    const reference = `FFM-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const siteUrl = paymentCallbackOrigin(request);
    const callbackUrl = new URL(`${siteUrl}/track`);
    callbackUrl.searchParams.set("paid", "1");
    callbackUrl.searchParams.set("reference", reference);
    callbackUrl.searchParams.set("code", reference);
    const pickupAddress = Array.from(new Set(items.map((item) => item.store).filter(Boolean))).join(", ") || (payload.kind === "shopping" ? "Shopping pickup" : "Restaurant pickup");

    try {
        const { data: delivery } = await supabase.from("deliveries").insert({
          delivery_code: reference,
          customer_id: user.id,
          pickup_address: pickupAddress,
          dropoff_address: payload.address || "Customer delivery address",
          pickup_contact: payload.kind === "shopping" ? "Shopping vendor" : "Restaurant vendor",
          dropoff_contact: payload.phone || payload.email,
          parcel_type: payload.kind === "shopping" ? "shopping items" : "food order",
          vehicle_type: "bike",
          delivery_speed: "same_day",
          payment_method: "card",
          status: "searching",
          price_ngn: expectedAmount,
          distance_km: isShopping ? 1 : 5,
          eta_minutes: 35,
          metadata: {
            source: "fastfleet_marketplace",
            kind: payload.kind,
            items,
            paystack_reference: reference
          }
        }).select("id").single();
        if (delivery?.id) {
          await supabase.from("delivery_events").insert({
            delivery_id: delivery.id,
            actor_id: user.id,
            status: "searching",
            title: "Marketplace order placed",
            body: "Fast Fleets 360 is notifying online drivers."
          });
        }
    } catch {
      // Local delivery fallback is still written in the browser before redirect.
    }

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
          platform_fee_ngn: platformFee,
          delivery_fee_ngn: deliveryFee,
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
