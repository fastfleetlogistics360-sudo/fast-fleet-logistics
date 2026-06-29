import { NextResponse } from "next/server";
import { normalizeState } from "@/lib/launch-states";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { extractNigerianState } from "@/lib/location/state-matching";
import { estimateMarketplaceCheckout } from "@/lib/marketplace-pricing";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize";

type CheckoutItem = {
  name: string;
  store: string;
  storeAddress?: string;
  pickupAddress?: string;
  mallLocation?: string;
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
    const address = sanitizeAddressText(payload.address || "");

    if (!payload.email || !payload.email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address for Paystack checkout." }, { status: 400 });
    }
    if (!items.length) {
      return NextResponse.json({ error: "Add at least one item before checkout." }, { status: 400 });
    }
    if (address.length < 6) {
      return NextResponse.json({ error: "Enter the delivery street address." }, { status: 400 });
    }
    const estimate = estimateMarketplaceCheckout({ kind: payload.kind, items, address });
    const platformFee = estimate.platformFee;
    const deliveryFee = estimate.deliveryFee;
    const expectedAmount = estimate.total;
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
    const callbackUrl = new URL(`${siteUrl}/marketplace/callback`);
    callbackUrl.searchParams.set("reference", reference);
    callbackUrl.searchParams.set("code", reference);
    callbackUrl.searchParams.set("returnTo", `/track?code=${encodeURIComponent(reference)}`);
    const pickupAddress = estimate.pickupAddress;
    const linkedBusinessIds = Array.from(new Set(items.map((item) => item.businessId).filter((id): id is string => Boolean(id))));
    if (linkedBusinessIds.length > 1) {
      return NextResponse.json({ error: "Checkout items from one registered business at a time." }, { status: 400 });
    }
    const admin = createAdminClient();
    const linkedBusinessId = linkedBusinessIds[0] || null;
    const linkedBusiness = linkedBusinessId && admin
      ? await admin
          .from("business_profiles")
          .select("id, user_id, business_name, pickup_address, registration_status, users:users!business_profiles_user_id_fkey(default_zone)")
          .eq("id", linkedBusinessId)
          .maybeSingle<{ id: string; user_id: string; business_name?: string | null; pickup_address?: string | null; registration_status?: string | null; users?: { default_zone?: string | null } | null }>()
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
            pickup_address: appendStateToAddress(business.pickup_address || pickupAddress, normalizeState(business.users?.default_zone)),
            dropoff_address: address,
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
          dropoff_address: address,
          pickup_contact: payload.kind === "shopping" ? "Shopping vendor" : "Restaurant vendor",
          dropoff_contact: payload.phone || payload.email,
          parcel_type: payload.kind === "shopping" ? "shopping items" : "food order",
          vehicle_type: "bike",
          delivery_speed: "same_day",
          payment_method: "card",
          status: "searching",
          price_ngn: expectedAmount,
          distance_km: estimate.distanceKm,
          eta_minutes: estimate.etaMinutes,
          metadata: {
            source: "fastfleet_marketplace",
            kind: payload.kind,
            items,
            delivery_fee_ngn: deliveryFee,
            platform_fee_ngn: platformFee,
            delivery_distance_km: estimate.distanceKm,
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
          delivery_address: address,
          platform_fee_ngn: platformFee,
          delivery_fee_ngn: deliveryFee,
          delivery_distance_km: estimate.distanceKm,
          eta_minutes: estimate.etaMinutes,
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

function appendStateToAddress(address: string, state: string) {
  const normalizedState = normalizeState(state);
  if (!normalizedState) return address;
  return extractNigerianState(address) === normalizedState ? address : `${address}, ${normalizedState}`;
}
