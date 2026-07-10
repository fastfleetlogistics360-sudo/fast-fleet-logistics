import { NextResponse } from "next/server";
import { recordDeliveryIncome } from "@/lib/company-ledger";
import { createDeliveryQuote } from "@/lib/delivery-quotes";
import { loadFareConfig } from "@/lib/fare-settings";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { extractNigerianState } from "@/lib/location/state-matching";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { generatePaymentReference, initiateSquadPayment, paymentChannelsFor } from "@/lib/payments/squad";
import { launchPromoMetadata, quoteLaunchDeliveryPromo, redeemLaunchDeliveryPromo, reserveLaunchDeliveryPromo, voidLaunchDeliveryPromo } from "@/lib/promos/launch-first-150";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountTrackingHref } from "@/lib/tracking-links";
import type { DeliverySpeed, VehicleType } from "@/types/domain";

const paymentMethods = new Set(["card", "wallet", "transfer"]);
const vehicleTypes = new Set(["bike", "car", "van"]);
const deliverySpeeds = new Set(["standard", "same_day", "express", "priority", "scheduled", "interstate"]);

type CheckoutPayload = {
  pickup?: string;
  pickupState?: string;
  pickupPlaceId?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupContact?: string;
  dropoff?: string;
  dropoffState?: string;
  dropoffPlaceId?: string;
  dropoffLatitude?: number;
  dropoffLongitude?: number;
  dropoffContact?: string;
  parcel?: string;
  vehicle?: VehicleType | "";
  speed?: DeliverySpeed | "";
  scheduledAt?: string;
  payment?: "card" | "wallet" | "transfer" | "";
  note?: string;
  total?: number;
};

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentCreate, name: "deliveries:checkout" });
    if (limited) return limited;

    const payload = (await request.json().catch(() => ({}))) as CheckoutPayload;
    const paymentMethod = String(payload.payment || "") as "card" | "wallet" | "transfer";
    const vehicle = String(payload.vehicle || "") as VehicleType;
    const speed = String(payload.speed || "") as DeliverySpeed;
    const pickup = sanitizeAddressText(String(payload.pickup || ""));
    const dropoff = sanitizeAddressText(String(payload.dropoff || ""));
    const parcel = String(payload.parcel || "").trim();
    const pickupState = extractNigerianState(pickup) || extractNigerianState(payload.pickupState);
    const dropoffState = extractNigerianState(dropoff) || extractNigerianState(payload.dropoffState);

    if (!pickup || !dropoff) {
      return NextResponse.json({ error: "Add both pickup and drop-off addresses." }, { status: 400 });
    }
    if (!parcel) {
      return NextResponse.json({ error: "Choose a parcel type." }, { status: 400 });
    }
    if (!paymentMethods.has(paymentMethod)) {
      return NextResponse.json({ error: "Choose card, transfer, or wallet balance." }, { status: 400 });
    }
    if (!vehicleTypes.has(vehicle) || !deliverySpeeds.has(speed)) {
      return NextResponse.json({ error: "Choose a valid vehicle and delivery speed." }, { status: 400 });
    }
    if (speed === "scheduled" && !payload.scheduledAt) {
      return NextResponse.json({ error: "Choose a scheduled pickup time." }, { status: 400 });
    }

    const fareConfig = await loadFareConfig();
    const quote = await createDeliveryQuote({
      pickup: {
        address: pickup,
        placeId: payload.pickupPlaceId,
        latitude: payload.pickupLatitude,
        longitude: payload.pickupLongitude
      },
      dropoff: {
        address: dropoff,
        placeId: payload.dropoffPlaceId,
        latitude: payload.dropoffLatitude,
        longitude: payload.dropoffLongitude
      },
      pickupState,
      dropoffState,
      vehicle,
      speed,
      parcelType: parcel,
      fareConfig
    });
    const estimate = quote.fare;

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before booking delivery." }, { status: 401 });
    const admin = createAdminClient();
    const db = admin || supabase;
    const promo = await quoteLaunchDeliveryPromo(db, user.id, quote);
    const promoMetadata = launchPromoMetadata(promo);
    const payableFare = promo.applied
      ? { ...estimate, deliveryFee: promo.deliveryFee, platformFee: promo.platformFee, total: promo.total }
      : estimate;

    if (Number(payload.total || 0) !== payableFare.total) {
      return NextResponse.json({ error: "Delivery total changed. Review the estimate and try again." }, { status: 400 });
    }

    const { data: profile } = await supabase.from("users").select("email, phone, full_name").eq("id", user.id).maybeSingle();
    const email = user.email || profile?.email || "";
    if (paymentMethod !== "wallet" && !email.includes("@")) {
      return NextResponse.json({ error: "Add an email address to your account before Squad checkout." }, { status: 400 });
    }

    const code = `FF-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;
    const squadReference = generatePaymentReference("FFD");
    const metadata = {
      note: payload.note || "",
      scheduled_at: payload.scheduledAt || null,
      source: "booking_checkout",
      pickup_state: pickupState || null,
      dropoff_state: dropoffState || null,
      route_source: quote.routeSource,
      route_type: quote.routeType,
      route_duration_seconds: quote.durationSeconds,
      bicycle_eligible: quote.bicycleEligible,
      vehicle_subtype: quote.vehicleSubtype,
      delivery_fee_ngn: estimate.deliveryFee,
      platform_fee_ngn: estimate.platformFee,
      payable_delivery_fee_ngn: payableFare.deliveryFee,
      payable_platform_fee_ngn: payableFare.platformFee,
      payable_total_ngn: payableFare.total,
      original_total_ngn: estimate.total,
      launch_promo: promoMetadata,
      payment_choice: paymentMethod,
      payment_provider: paymentMethod === "wallet" ? "wallet" : "squad",
      provider_reference: paymentMethod === "wallet" ? null : squadReference
    };

    const { data: delivery, error: insertError } = await db
      .from("deliveries")
      .insert({
        delivery_code: code,
        customer_id: user.id,
        pickup_address: pickup,
        dropoff_address: dropoff,
        pickup_contact: String(payload.pickupContact || "").trim(),
        dropoff_contact: String(payload.dropoffContact || "").trim(),
        parcel_type: parcel,
        vehicle_type: vehicle,
        delivery_speed: speed,
        payment_method: paymentMethod,
        status: "pending_payment",
        price_ngn: payableFare.total,
        delivery_fee_ngn: estimate.deliveryFee,
        platform_fee_ngn: estimate.platformFee,
        distance_km: estimate.distanceKm,
        eta_minutes: estimate.etaMinutes,
        route_source: quote.routeSource,
        route_type: quote.routeType,
        route_duration_seconds: quote.durationSeconds,
        vehicle_subtype: quote.vehicleSubtype,
        scheduled_at: payload.scheduledAt || null,
        metadata
      })
      .select("id, delivery_code")
      .single();

    if (insertError) throw insertError;
    if (promoMetadata) {
      const reservation = await reserveLaunchDeliveryPromo(db, delivery.id);
      if (!reservation.reserved) {
        await db.from("deliveries").update({ status: "cancelled", metadata: { ...metadata, launch_promo_error: "reservation_failed" } }).eq("id", delivery.id);
        return NextResponse.json({ error: "Launch promo slots changed. Review the estimate and try again." }, { status: 400 });
      }
    }

    if (paymentMethod === "wallet") {
      const { error: paymentError } = await supabase.rpc("pay_delivery_from_wallet", {
        target_delivery_id: delivery.id,
        next_metadata: {
          source: "booking_checkout",
          delivery_code: code,
          launch_promo: promoMetadata
        }
      });
      if (paymentError) {
        if (promoMetadata) await voidLaunchDeliveryPromo(db, delivery.id, "wallet_payment_failed");
        await db.from("deliveries").update({ status: "cancelled", metadata: { ...metadata, wallet_error: paymentError.message } }).eq("id", delivery.id);
        return NextResponse.json(
          { error: `${paymentError.message}. Top up your wallet or choose card/transfer instead.` },
          { status: 400 }
        );
      }

      await db.from("delivery_events").insert({
        delivery_id: delivery.id,
        actor_id: user.id,
        status: "searching",
        title: "Payment received",
        body: "Wallet payment received. Fast Fleets 360 is notifying online drivers."
      });
      await recordDeliveryIncome({
        amountNgn: payableFare.total,
        deliveryCode: delivery.delivery_code,
        paymentMethod: "wallet",
        reference: `${delivery.delivery_code}-wallet-checkout`,
        counterparty: profile?.full_name || email || user.id,
        notes: "Customer wallet balance was debited for this delivery."
      });
      if (promoMetadata) await redeemLaunchDeliveryPromo(db, delivery.id);

      return NextResponse.json({
        deliveryId: delivery.id,
        deliveryCode: delivery.delivery_code,
        status: "searching",
        paid: true
      });
    }

    const siteUrl = paymentCallbackOrigin(request);
    const callbackUrl = new URL(`${siteUrl}/delivery/callback`);
    callbackUrl.searchParams.set("reference", squadReference);
    callbackUrl.searchParams.set("code", delivery.delivery_code);
    callbackUrl.searchParams.set("deliveryId", delivery.id);
    callbackUrl.searchParams.set("returnTo", accountTrackingHref(delivery.delivery_code));

    let squadCheckout;
    try {
      squadCheckout = await initiateSquadPayment({
        amountNgn: payableFare.total,
        email,
        reference: squadReference,
        callbackUrl: callbackUrl.toString(),
        customerName: profile?.full_name || null,
        channels: paymentChannelsFor(paymentMethod),
        metadata: {
          source: "booking_checkout",
          delivery_id: delivery.id,
          delivery_code: delivery.delivery_code,
          payment_method: paymentMethod,
          pickup_address: pickup,
          pickup_state: pickupState || null,
          dropoff_address: dropoff,
          dropoff_state: dropoffState || null,
          route_source: quote.routeSource,
          route_type: quote.routeType,
          route_duration_seconds: quote.durationSeconds,
          bicycle_eligible: quote.bicycleEligible,
          vehicle_subtype: quote.vehicleSubtype,
          delivery_fee_ngn: estimate.deliveryFee,
          platform_fee_ngn: estimate.platformFee,
          payable_delivery_fee_ngn: payableFare.deliveryFee,
          payable_platform_fee_ngn: payableFare.platformFee,
          payable_total_ngn: payableFare.total,
          original_total_ngn: estimate.total,
          launch_promo: promoMetadata,
          customer_phone: profile?.phone || user.phone || String(payload.dropoffContact || payload.pickupContact || "").trim() || null,
          customer_name: profile?.full_name || null
        }
      });
    } catch (error) {
      if (promoMetadata) await voidLaunchDeliveryPromo(db, delivery.id, "squad_initialize_failed");
      await db.from("deliveries").update({ status: "cancelled", metadata: { ...metadata, squad_error: error instanceof Error ? error.message : "initialize_failed" } }).eq("id", delivery.id);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Squad could not initialize this payment." }, { status: 502 });
    }

    return NextResponse.json({
      deliveryId: delivery.id,
      deliveryCode: delivery.delivery_code,
      reference: squadCheckout.reference,
      authorizationUrl: squadCheckout.authorizationUrl,
      accessCode: squadCheckout.accessCode
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create delivery checkout." }, { status: 500 });
  }
}
