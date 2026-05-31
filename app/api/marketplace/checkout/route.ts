import { NextResponse } from "next/server";
import { PLATFORM_CHECKOUT_FEE_NGN } from "@/lib/fare";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { createAdminClient } from "@/lib/supabase/admin";
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
  storeId?: string;
  businessId?: string;
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
    if (!payload.address || payload.address.trim().length < 6) {
      return NextResponse.json({ error: "Enter the delivery street address." }, { status: 400 });
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
    const linkedBusinessIds = Array.from(new Set(items.map((item) => item.businessId).filter((id): id is string => Boolean(id))));
    if (linkedBusinessIds.length > 1) {
      return NextResponse.json({ error: "Checkout items from one registered business at a time." }, { status: 400 });
    }
    const admin = createAdminClient();
    const linkedBusinessId = linkedBusinessIds[0] || null;
    const linkedBusiness = linkedBusinessId && admin
      ? await admin
          .from("business_profiles")
          .select("id, user_id, business_name, pickup_address, registration_status")
          .eq("id", linkedBusinessId)
          .maybeSingle<{ id: string; user_id: string; business_name?: string | null; pickup_address?: string | null; registration_status?: string | null }>()
      : null;
    const business = linkedBusiness?.data?.registration_status === "active" ? linkedBusiness.data : null;

    if (business) {
      try {
        if (!admin) {
          return NextResponse.json({ error: "Business marketplace orders are not configured. Add SUPABASE_SERVICE_ROLE_KEY in production." }, { status: 503 });
        }
        const { data: order, error: orderError } = await admin
          .from("orders")
          .insert({
            order_code: reference,
            customer_id: user.id,
            business_id: business.user_id,
            business_profile_id: business.id,
            marketplace_kind: payload.kind || "restaurant",
            items,
            customer_contact: payload.phone || payload.email,
            pickup_address: business.pickup_address || pickupAddress,
            dropoff_address: payload.address,
            package_type: payload.kind === "shopping" ? "shopping items" : "food order",
            vehicle_type: "bike",
            status: "received",
            amount: expectedAmount,
            payment_method: "card",
            payment_status: "pending"
          })
          .select("id, order_code")
          .single();
        if (orderError) throw orderError;

        await Promise.allSettled([
          admin.from("notifications").insert({
            user_id: business.user_id,
            title: "New marketplace order",
            body: `${reference} is waiting for your team to receive and prepare.`,
            type: "business_order_received",
            channel: "in_app",
            metadata: { order_id: order?.id, order_code: reference, business_profile_id: business.id }
          }),
          supabase.from("notifications").insert({
            user_id: user.id,
            title: "Order sent to business",
            body: `${business.business_name || "The business"} received ${reference}.`,
            type: "order_update",
            channel: "in_app",
            metadata: { order_id: order?.id, order_code: reference, status: "received" }
          })
        ]);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the business marketplace order." }, { status: 500 });
      }
    } else {
      try {
        const { data: delivery } = await supabase.from("deliveries").insert({
          delivery_code: reference,
          customer_id: user.id,
          pickup_address: pickupAddress,
          dropoff_address: payload.address,
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
          delivery_address: payload.address,
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
      accessCode: paystackData.data.access_code,
      businessOrder: Boolean(business),
      status: business ? "received" : "searching"
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Marketplace checkout failed." }, { status: 500 });
  }
}
