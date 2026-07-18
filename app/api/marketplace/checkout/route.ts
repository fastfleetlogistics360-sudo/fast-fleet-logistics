import { NextResponse } from "next/server";
import { loadFareConfig } from "@/lib/fare-settings";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import {
  businessPickupAddressFor,
  loadActiveLinkedBusiness,
  resolveMarketplaceBusinessLinks,
  type MarketplaceCheckoutItem
} from "@/lib/marketplace-business-links";
import { estimateMarketplaceCheckout, marketplacePickupAddress } from "@/lib/marketplace-pricing";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { createPaymentIntent, markPaymentIntentInitializationFailed, markPaymentIntentPending, type PaymentIntentPurpose } from "@/lib/payments/payment-intents";
import { generatePaymentReference, initiateSquadPayment } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountTrackingHref } from "@/lib/tracking-links";

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentCreate, name: "marketplace:checkout" });
    if (limited) return limited;

    const payload = (await request.json()) as {
      kind?: "restaurant" | "shopping";
      email?: string;
      phone?: string;
      address?: string;
      amount?: number;
      items?: MarketplaceCheckoutItem[];
      fees?: {
        platformFee?: number;
        deliveryFee?: number;
      };
    };

    const items = Array.isArray(payload.items) ? payload.items : [];
    const address = sanitizeAddressText(payload.address || "");

    if (!payload.email || !payload.email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address for Squad checkout." }, { status: 400 });
    }
    if (!items.length) {
      return NextResponse.json({ error: "Add at least one item before checkout." }, { status: 400 });
    }
    if (address.length < 6) {
      return NextResponse.json({ error: "Enter the delivery street address." }, { status: 400 });
    }
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before placing this order." }, { status: 401 });

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Secure payment checkout is temporarily unavailable. Please try again." }, { status: 503 });
    }
    const businessLinks = await resolveMarketplaceBusinessLinks(admin, payload.kind, items);
    if (businessLinks.linkedBusinessIds.length > 1) {
      return NextResponse.json({ error: "Checkout items from one registered business at a time." }, { status: 400 });
    }
    if (businessLinks.hasLinkedItems && businessLinks.hasUnlinkedItems) {
      return NextResponse.json({ error: "Checkout items must all belong to the same linked marketplace business." }, { status: 400 });
    }
    const resolvedItems = businessLinks.items;
    const linkedBusinessId = businessLinks.linkedBusinessIds[0] || null;
    const business = await loadActiveLinkedBusiness(admin, linkedBusinessId);
    const marketplaceKind = payload.kind === "shopping" ? "shopping" : "restaurant";
    const quotePickupAddress = business ? businessPickupAddressFor(business, marketplacePickupAddress(resolvedItems, marketplaceKind)) : null;
    const fareConfig = await loadFareConfig();
    const estimate = await estimateMarketplaceCheckout({ kind: payload.kind, items: resolvedItems, address, pickupAddress: quotePickupAddress, fareConfig });
    const platformFee = estimate.platformFee;
    const deliveryFee = estimate.deliveryFee;
    const expectedAmount = estimate.total;
    if (Number(payload.amount) !== expectedAmount) {
      return NextResponse.json({ error: "Checkout total changed. Refresh and try again." }, { status: 400 });
    }

    const reference = generatePaymentReference("FFM");
    const siteUrl = paymentCallbackOrigin(request);
    const callbackUrl = new URL(`${siteUrl}/marketplace/callback`);
    callbackUrl.searchParams.set("reference", reference);
    callbackUrl.searchParams.set("code", reference);
    callbackUrl.searchParams.set("returnTo", accountTrackingHref(reference));
    const pickupAddress = estimate.pickupAddress;
    let paymentIntentTarget: { purpose: PaymentIntentPurpose; internalReference: string; deliveryId?: string; orderId?: string } | null = null;

    if (business) {
      try {
        const { data: order, error: orderError } = await admin
          .from("orders")
          .insert({
            order_code: reference,
            customer_id: user.id,
            business_id: business.user_id,
            business_profile_id: business.id,
            marketplace_kind: payload.kind || "restaurant",
            items: resolvedItems,
            customer_contact: payload.phone || payload.email,
            pickup_address: pickupAddress,
            dropoff_address: address,
            package_type: payload.kind === "shopping" ? "shopping items" : "food order",
            vehicle_type: "bike",
            vehicle_subtype: estimate.vehicleSubtype,
            status: "pending",
            amount: expectedAmount,
            delivery_fee_ngn: deliveryFee,
            platform_fee_ngn: platformFee,
            distance_km: estimate.distanceKm,
            eta_minutes: estimate.etaMinutes,
            route_source: estimate.routeSource,
            route_type: estimate.routeType,
            payment_method: "card",
            payment_status: "pending"
          })
          .select("id, order_code")
          .single();
        if (orderError) throw orderError;
        paymentIntentTarget = {
          purpose: "marketplace_business_order",
          internalReference: `order:${order.id}`,
          orderId: order.id
        };

      } catch {
        return NextResponse.json({ error: "Could not create the business marketplace order." }, { status: 500 });
      }
    } else {
      try {
        const { data: delivery, error: deliveryError } = await supabase.from("deliveries").insert({
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
          status: "pending_payment",
          price_ngn: expectedAmount,
          delivery_fee_ngn: deliveryFee,
          platform_fee_ngn: platformFee,
          distance_km: estimate.distanceKm,
          eta_minutes: estimate.etaMinutes,
          route_source: estimate.routeSource,
          route_type: estimate.routeType,
          route_duration_seconds: estimate.durationSeconds,
          vehicle_subtype: estimate.vehicleSubtype,
          metadata: {
            source: "fastfleet_marketplace",
            kind: payload.kind,
            items: resolvedItems,
            pickup_state: estimate.pickupState || null,
            dropoff_state: estimate.dropoffState || null,
            delivery_fee_ngn: deliveryFee,
            platform_fee_ngn: platformFee,
            delivery_distance_km: estimate.distanceKm,
            route_source: estimate.routeSource,
            route_type: estimate.routeType,
            route_duration_seconds: estimate.durationSeconds,
            bicycle_eligible: estimate.bicycleEligible,
            vehicle_subtype: estimate.vehicleSubtype,
            payment_provider: "squad",
            provider_reference: reference
          }
        }).select("id").single();
        if (deliveryError) throw deliveryError;
        paymentIntentTarget = {
          purpose: "marketplace_delivery_payment",
          internalReference: `delivery:${delivery.id}`,
          deliveryId: delivery.id
        };
      } catch {
        return NextResponse.json({ error: "Could not create the marketplace delivery." }, { status: 500 });
      }
    }

    if (!paymentIntentTarget) {
      return NextResponse.json({ error: "Secure payment checkout is temporarily unavailable. Please try again." }, { status: 503 });
    }

    let paymentIntent;
    try {
      paymentIntent = await createPaymentIntent(admin, {
        reference,
        internalReference: paymentIntentTarget.internalReference,
        purpose: paymentIntentTarget.purpose,
        ownerUserId: user.id,
        amountNgn: expectedAmount,
        deliveryId: paymentIntentTarget.deliveryId || null,
        orderId: paymentIntentTarget.orderId || null
      });
    } catch {
      await cancelMarketplacePaymentTarget(admin, paymentIntentTarget);
      return NextResponse.json({ error: "Secure payment checkout is temporarily unavailable. Please try again." }, { status: 503 });
    }

    let squadCheckout;
    try {
      squadCheckout = await initiateSquadPayment({
        amountNgn: expectedAmount,
        email: payload.email,
        reference,
        callbackUrl: callbackUrl.toString(),
        customerName: payload.phone || payload.email,
        metadata: {
          purpose: paymentIntentTarget.purpose,
          internal_reference: paymentIntentTarget.internalReference
        }
      });
    } catch {
      await markPaymentIntentInitializationFailed(admin, paymentIntent.id).catch(() => undefined);
      await cancelMarketplacePaymentTarget(admin, paymentIntentTarget);
      return NextResponse.json({ error: "Payment checkout could not start. Please try again." }, { status: 502 });
    }

    await markPaymentIntentPending(admin, paymentIntent.id).catch(() => undefined);

    return NextResponse.json({
      reference: squadCheckout.reference,
      authorizationUrl: squadCheckout.authorizationUrl,
      userId: user.id,
      vehicleSubtype: estimate.vehicleSubtype,
      businessOrder: Boolean(business),
      status: business ? "pending" : "pending_payment"
    });
  } catch {
    return NextResponse.json({ error: "Marketplace checkout failed." }, { status: 500 });
  }
}

async function cancelMarketplacePaymentTarget(
  db: NonNullable<ReturnType<typeof createAdminClient>> | Awaited<ReturnType<typeof createClient>>,
  target: { purpose: PaymentIntentPurpose; internalReference: string; deliveryId?: string; orderId?: string }
) {
  if (target.orderId) {
    await db.from("orders").update({ status: "cancelled", payment_status: "failed", updated_at: new Date().toISOString() }).eq("id", target.orderId);
    return;
  }
  if (target.deliveryId) {
    await db.from("deliveries").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", target.deliveryId);
  }
}
