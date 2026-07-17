import { NextResponse } from "next/server";
import { recordDeliveryIncome } from "@/lib/company-ledger";
import { createDeliveryQuote } from "@/lib/delivery-quotes";
import { loadFareConfig } from "@/lib/fare-settings";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { createClient } from "@/lib/supabase/server";
import { extractNigerianState } from "@/lib/location/state-matching";
import { accountMessengerHref } from "@/lib/tracking-links";
import type { DeliverySpeed, VehicleType } from "@/types/domain";

const vehicleTypes = new Set<VehicleType>(["bike", "car", "van"]);

type DispatchPayload = {
  senderName?: string;
  senderPhone?: string;
  pickupAddress?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  recipientName?: string;
  recipientPhone?: string;
  dropoffAddress?: string;
  dropoffLatitude?: number;
  dropoffLongitude?: number;
  packageType?: string;
  instructions?: string;
  vehicleType?: string;
  scheduleMode?: string;
  scheduledAt?: string;
  payment?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DispatchPayload;
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Please sign in before creating a dispatch." }, { status: 401 });
    }

    const pickupAddress = clean(payload.pickupAddress);
    const dropoffAddress = clean(payload.dropoffAddress);
    const pickupLatitude = coordinateValue(payload.pickupLatitude, 90);
    const pickupLongitude = coordinateValue(payload.pickupLongitude, 180);
    const dropoffLatitude = coordinateValue(payload.dropoffLatitude, 90);
    const dropoffLongitude = coordinateValue(payload.dropoffLongitude, 180);
    const senderName = clean(payload.senderName);
    const senderPhone = clean(payload.senderPhone);
    const recipientName = clean(payload.recipientName);
    const recipientPhone = clean(payload.recipientPhone);

    if (!pickupAddress || !dropoffAddress || !senderName || !senderPhone || !recipientName || !recipientPhone) {
      return NextResponse.json({ error: "Complete sender, recipient, pickup, and drop-off details." }, { status: 400 });
    }

    const requestedVehicle = clean(payload.vehicleType).toLowerCase();
    const vehicleType: VehicleType = vehicleTypes.has(requestedVehicle as VehicleType) ? (requestedVehicle as VehicleType) : "bike";
    const deliverySpeed: DeliverySpeed = payload.scheduleMode === "Schedule for later" ? "scheduled" : "standard";
    const paymentMethod = "wallet";
    const fareConfig = await loadFareConfig();
    const quote = await createDeliveryQuote({
      pickup: { address: pickupAddress, latitude: pickupLatitude, longitude: pickupLongitude },
      dropoff: { address: dropoffAddress, latitude: dropoffLatitude, longitude: dropoffLongitude },
      pickupState: extractNigerianState(pickupAddress),
      dropoffState: extractNigerianState(dropoffAddress),
      vehicle: vehicleType,
      speed: deliverySpeed,
      parcelType: clean(payload.packageType) || "Parcel",
      fareConfig
    });
    const fare = quote.fare;
    const deliveryCode = `FF-BIZ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const { data: businessProfile } = await supabase
      .from("business_profiles")
      .select("id, business_name, registration_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (businessProfile?.registration_status !== "active") {
      return NextResponse.json({ error: "Business KYC must be approved before creating dispatches." }, { status: 403 });
    }

    const { data: delivery, error } = await supabase
      .from("deliveries")
      .insert({
        customer_id: user.id,
        delivery_code: deliveryCode,
        pickup_address: pickupAddress,
        pickup_latitude: pickupLatitude,
        pickup_longitude: pickupLongitude,
        pickup_contact: `${senderName} ${senderPhone}`,
        dropoff_address: dropoffAddress,
        dropoff_latitude: dropoffLatitude,
        dropoff_longitude: dropoffLongitude,
        dropoff_contact: `${recipientName} ${recipientPhone}`,
        parcel_type: clean(payload.packageType) || "Parcel",
        vehicle_type: vehicleType,
        delivery_speed: deliverySpeed,
        payment_method: paymentMethod,
        status: "pending_payment",
        price_ngn: fare.total,
        delivery_fee_ngn: fare.deliveryFee,
        platform_fee_ngn: fare.platformFee,
        distance_km: fare.distanceKm,
        eta_minutes: fare.etaMinutes,
        route_source: quote.routeSource,
        route_type: quote.routeType,
        route_duration_seconds: quote.durationSeconds,
        vehicle_subtype: quote.vehicleSubtype,
        scheduled_at: payload.scheduleMode === "Schedule for later" && payload.scheduledAt ? payload.scheduledAt : null,
        metadata: {
          source: "business_dashboard",
          business_profile_id: businessProfile?.id ?? null,
          business_name: businessProfile?.business_name ?? null,
          pickup_state: quote.pickupState || null,
          dropoff_state: quote.dropoffState || null,
          pickup_latitude: pickupLatitude,
          pickup_longitude: pickupLongitude,
          dropoff_latitude: dropoffLatitude,
          dropoff_longitude: dropoffLongitude,
          route_source: quote.routeSource,
          route_type: quote.routeType,
          route_duration_seconds: quote.durationSeconds,
          bicycle_eligible: quote.bicycleEligible,
          vehicle_subtype: quote.vehicleSubtype,
          delivery_fee_ngn: fare.deliveryFee,
          platform_fee_ngn: fare.platformFee,
          sender_name: senderName,
          sender_phone: senderPhone,
          recipient_name: recipientName,
          recipient_phone: recipientPhone,
          instructions: clean(payload.instructions),
          payment_choice: payload.payment || "wallet"
        }
      })
      .select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, created_at, proof_url")
      .single();

    if (error) throw error;

    const { error: walletError } = await supabase.rpc("pay_delivery_from_wallet", {
      target_delivery_id: delivery.id,
      next_metadata: { source: "business_dashboard" }
    });
    if (walletError) {
      await supabase.from("deliveries").delete().eq("id", delivery.id);
      throw walletError;
    }
    delivery.status = "searching";

    await Promise.allSettled([
      supabase.from("delivery_events").insert({
        delivery_id: delivery.id,
        actor_id: user.id,
        status: delivery.status,
        title: "Business dispatch created",
        body: "Wallet payment received. Fast Fleets 360 is finding a courier."
      }),
      insertNotificationWithPush(supabase, {
        user_id: user.id,
        title: "Dispatch created",
        body: `${delivery.delivery_code} is ${delivery.status.replaceAll("_", " ")}.`,
        type: "dispatch_created",
        metadata: { delivery_id: delivery.id, delivery_code: delivery.delivery_code, url: accountMessengerHref(delivery.delivery_code), tag: `ff-business-${delivery.delivery_code}` }
      })
    ]);
    await recordDeliveryIncome({
      amountNgn: fare.total,
      deliveryCode: delivery.delivery_code,
      paymentMethod: "wallet",
      reference: `${delivery.delivery_code}-wallet-checkout`,
      counterparty: businessProfile?.business_name || user.email || user.id,
      notes: "Business wallet balance was debited for this dispatch."
    });

    return NextResponse.json({ delivery });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create dispatch." }, { status: 500 });
  }
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function coordinateValue(value: unknown, maxAbs: number) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= maxAbs ? number : null;
}
