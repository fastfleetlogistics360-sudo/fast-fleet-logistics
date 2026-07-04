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
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize";

export async function POST(request: Request) {
  try {
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
      return NextResponse.json({ error: "Enter a valid email address for Paystack checkout." }, { status: 400 });
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
    const businessLinks = admin
      ? await resolveMarketplaceBusinessLinks(admin, payload.kind, items)
      : {
          items,
          linkedBusinessIds: [] as string[],
          hasLinkedItems: false,
          hasUnlinkedItems: items.some((item) => !item.businessId)
        };
    if (businessLinks.linkedBusinessIds.length > 1) {
      return NextResponse.json({ error: "Checkout items from one registered business at a time." }, { status: 400 });
    }
    if (businessLinks.hasLinkedItems && businessLinks.hasUnlinkedItems) {
      return NextResponse.json({ error: "Checkout items must all belong to the same linked marketplace business." }, { status: 400 });
    }
    const resolvedItems = businessLinks.items;
    const linkedBusinessId = businessLinks.linkedBusinessIds[0] || null;
    if (linkedBusinessId && !admin) {
      return NextResponse.json({ error: "Business marketplace orders are not configured. Add SUPABASE_SERVICE_ROLE_KEY in production." }, { status: 503 });
    }
    const business = admin ? await loadActiveLinkedBusiness(admin, linkedBusinessId) : null;
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
          route_source: estimate.routeSource,
          route_type: estimate.routeType,
          route_duration_seconds: estimate.durationSeconds,
          bicycle_eligible: estimate.bicycleEligible,
          vehicle_subtype: estimate.vehicleSubtype,
          eta_minutes: estimate.etaMinutes,
          items: resolvedItems
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
      status: business ? "pending" : "searching"
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Marketplace checkout failed." }, { status: 500 });
  }
}
