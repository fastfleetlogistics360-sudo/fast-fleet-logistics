import { NextResponse } from "next/server";
import { estimateFare } from "@/lib/fare";
import { createClient } from "@/lib/supabase/server";
import type { DeliverySpeed, VehicleType } from "@/types/domain";

const PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize";
const paymentMethods = new Set(["card", "wallet", "transfer"]);
const vehicleTypes = new Set(["bike", "car", "van"]);
const deliverySpeeds = new Set(["standard", "same_day", "express", "priority", "scheduled", "interstate"]);

type CheckoutPayload = {
  pickup?: string;
  pickupContact?: string;
  dropoff?: string;
  dropoffContact?: string;
  parcel?: string;
  vehicle?: VehicleType;
  speed?: DeliverySpeed;
  scheduledAt?: string;
  payment?: "card" | "wallet" | "transfer";
  note?: string;
  total?: number;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as CheckoutPayload;
    const paymentMethod = String(payload.payment || "card") as "card" | "wallet" | "transfer";
    const vehicle = String(payload.vehicle || "bike") as VehicleType;
    const speed = String(payload.speed || "express") as DeliverySpeed;
    const pickup = String(payload.pickup || "").trim();
    const dropoff = String(payload.dropoff || "").trim();
    const parcel = String(payload.parcel || "Retail parcel").trim();

    if (!pickup || !dropoff) {
      return NextResponse.json({ error: "Add both pickup and drop-off addresses." }, { status: 400 });
    }
    if (!paymentMethods.has(paymentMethod)) {
      return NextResponse.json({ error: "Choose card, transfer, or wallet balance." }, { status: 400 });
    }
    if (!vehicleTypes.has(vehicle) || !deliverySpeeds.has(speed)) {
      return NextResponse.json({ error: "Choose a valid vehicle and delivery speed." }, { status: 400 });
    }

    const estimate = estimateFare({
      pickup,
      dropoff,
      vehicle,
      speed,
      scheduledAt: payload.scheduledAt || "",
      zone: `${pickup} ${dropoff}`
    });

    if (Number(payload.total || 0) !== estimate.total) {
      return NextResponse.json({ error: "Delivery total changed. Review the estimate and try again." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before booking delivery." }, { status: 401 });

    const email = user.email || "";
    if (paymentMethod !== "wallet" && !email.includes("@")) {
      return NextResponse.json({ error: "Add an email address to your account before Paystack checkout." }, { status: 400 });
    }

    const code = `FF-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;
    const paystackReference = `FFD-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const metadata = {
      note: payload.note || "",
      scheduled_at: payload.scheduledAt || null,
      source: "booking_checkout",
      payment_choice: paymentMethod,
      paystack_reference: paymentMethod === "wallet" ? null : paystackReference
    };

    const { data: delivery, error: insertError } = await supabase
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
        price_ngn: estimate.total,
        distance_km: estimate.distanceKm,
        eta_minutes: estimate.etaMinutes,
        scheduled_at: payload.scheduledAt || null,
        metadata
      })
      .select("id, delivery_code")
      .single();

    if (insertError) throw insertError;

    if (paymentMethod === "wallet") {
      const { error: paymentError } = await supabase.rpc("pay_delivery_from_wallet", {
        target_delivery_id: delivery.id,
        next_metadata: {
          source: "booking_checkout",
          delivery_code: code
        }
      });
      if (paymentError) {
        await supabase.from("deliveries").update({ status: "cancelled", metadata: { ...metadata, wallet_error: paymentError.message } }).eq("id", delivery.id);
        return NextResponse.json(
          { error: `${paymentError.message}. Top up your wallet or choose card/transfer instead.` },
          { status: 400 }
        );
      }

      await supabase.from("delivery_events").insert({
        delivery_id: delivery.id,
        actor_id: user.id,
        status: "searching",
        title: "Payment received",
        body: "Wallet payment received. Fast Fleets 360 is notifying online drivers."
      });

      return NextResponse.json({
        deliveryId: delivery.id,
        deliveryCode: delivery.delivery_code,
        status: "searching",
        paid: true
      });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      await supabase.from("deliveries").update({ status: "cancelled", metadata: { ...metadata, paystack_error: "missing_secret" } }).eq("id", delivery.id);
      return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY. Add it before card or transfer checkout." }, { status: 500 });
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
    const callbackUrl = new URL(`${siteUrl}/delivery/callback`);
    callbackUrl.searchParams.set("code", delivery.delivery_code);
    callbackUrl.searchParams.set("deliveryId", delivery.id);
    callbackUrl.searchParams.set("returnTo", `/track?code=${encodeURIComponent(delivery.delivery_code)}`);

    const paystackResponse = await fetch(PAYSTACK_INITIALIZE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: Math.round(estimate.total * 100),
        email,
        currency: "NGN",
        reference: paystackReference,
        callback_url: callbackUrl.toString(),
        channels: paymentMethod === "card" ? ["card"] : ["bank_transfer"],
        metadata: {
          source: "booking_checkout",
          delivery_id: delivery.id,
          delivery_code: delivery.delivery_code,
          payment_method: paymentMethod,
          pickup_address: pickup,
          dropoff_address: dropoff,
          customer_phone: String(payload.dropoffContact || payload.pickupContact || "").trim() || null
        }
      })
    });
    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      await supabase.from("deliveries").update({ status: "cancelled", metadata: { ...metadata, paystack_error: paystackData.message || "initialize_failed" } }).eq("id", delivery.id);
      return NextResponse.json({ error: paystackData.message || "Paystack could not initialize this payment." }, { status: 502 });
    }

    return NextResponse.json({
      deliveryId: delivery.id,
      deliveryCode: delivery.delivery_code,
      reference: paystackReference,
      authorizationUrl: paystackData.data.authorization_url,
      accessCode: paystackData.data.access_code
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create delivery checkout." }, { status: 500 });
  }
}
