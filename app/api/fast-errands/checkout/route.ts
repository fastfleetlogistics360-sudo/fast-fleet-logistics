import { NextResponse } from "next/server";
import { loadFareConfig } from "@/lib/fare-settings";
import { createDeliveryQuote } from "@/lib/delivery-quotes";
import { businessPickupAddressFor, loadActiveLinkedBusiness } from "@/lib/marketplace-business-links";
import { findShoppingVendor } from "@/lib/mall-menu";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { createPaymentIntent, markPaymentIntentInitializationFailed, markPaymentIntentPending } from "@/lib/payments/payment-intents";
import { generatePaymentReference, initiateSquadPayment } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadPublicShoppingMalls } from "@/lib/public-content";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { extractNigerianState } from "@/lib/location/state-matching";
import { normalizeState } from "@/lib/launch-states";

const SERVICE_FEE_NGN = 500;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before starting a FastErrand." }, { status: 401 });
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentCreate, name: "fast-errands:checkout" });
    if (limited) return limited;
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const vendorId = String(payload.vendorId || "").trim();
    const budget = Math.round(Number(payload.purchaseBudgetNgn || 0));
    const address = sanitizeAddressText(String(payload.address || ""));
    const email = String(payload.email || user.email || "").trim();
    const phone = String(payload.phone || "").trim();
    const items = String(payload.items || "").trim().slice(0, 2000);
    if (!vendorId || budget < 500 || !items || address.length < 6 || !email.includes("@")) {
      return NextResponse.json({ error: "Choose a verified vendor, describe the items, enter a purchase budget, delivery address, and receipt email." }, { status: 400 });
    }
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "FastErrands checkout is temporarily unavailable." }, { status: 503 });
    const malls = await loadPublicShoppingMalls();
    const vendor = findShoppingVendor(malls, vendorId);
    if (!vendor?.store.businessId) return NextResponse.json({ error: "This vendor is not yet verified for FastErrands." }, { status: 409 });
    if (vendor.store.operatingStatus === "closed") return NextResponse.json({ error: "This vendor is currently closed." }, { status: 409 });
    const business = await loadActiveLinkedBusiness(db, vendor.store.businessId);
    if (!business) return NextResponse.json({ error: "This vendor is not active for FastErrands yet." }, { status: 409 });
    const pickup = vendor.store.pickupAddress || businessPickupAddressFor(business, vendor.mall.location || vendor.mall.name);
    const pickupState = extractNigerianState(pickup);
    const dropoffState = extractNigerianState(address);
    const vendorStates = Array.from(new Set((vendor.store.operatingStates || []).map(normalizeState).filter(Boolean)));
    if (vendorStates.length && (!dropoffState || !vendorStates.includes(dropoffState))) {
      return NextResponse.json({ error: `This vendor currently serves ${vendorStates.join(", ")}. Choose a delivery address in one of those states.` }, { status: 409 });
    }
    const quote = await createDeliveryQuote({ pickup: { address: pickup }, dropoff: { address }, pickupState, dropoffState, vehicle: "bike", speed: "standard", parcelType: "FastErrands verified-store purchase", fareConfig: await loadFareConfig() });
    const deliveryFee = Math.max(0, Math.round(quote.fare.deliveryFee));
    const total = budget + deliveryFee + SERVICE_FEE_NGN;
    const reference = generatePaymentReference("FFE");
    const errandCode = `FE-${Date.now().toString().slice(-7)}-${Math.floor(10 + Math.random() * 90)}`;
    const { data: delivery, error: deliveryError } = await db.from("deliveries").insert({
      delivery_code: errandCode,
      customer_id: user.id,
      pickup_address: pickup,
      dropoff_address: address,
      pickup_contact: vendor.store.name,
      dropoff_contact: phone || email,
      parcel_type: "FastErrands verified-store purchase",
      vehicle_type: quote.vehicle,
      delivery_speed: quote.speed,
      payment_method: "card",
      status: "pending_payment",
      price_ngn: total,
      delivery_fee_ngn: deliveryFee,
      platform_fee_ngn: SERVICE_FEE_NGN,
      distance_km: quote.distanceKm,
      eta_minutes: quote.etaMinutes,
      route_source: quote.routeSource,
      route_type: quote.routeType,
      route_duration_seconds: quote.durationSeconds,
      vehicle_subtype: quote.vehicleSubtype,
      metadata: { source: "fast_errands", vendor_funding_status: "awaiting_customer_payment", vendor_id: vendor.store.id, business_profile_id: business.id, purchase_budget_ngn: budget, delivery_fee_ngn: deliveryFee, service_fee_ngn: SERVICE_FEE_NGN, errand_items: items, provider_reference: reference }
    }).select("id, delivery_code").single<{ id: string; delivery_code: string }>();
    if (deliveryError || !delivery) throw deliveryError || new Error("Could not create FastErrand delivery.");
    const { data: errand, error: errandError } = await db.from("fast_errand_orders").insert({ errand_code: errandCode, customer_id: user.id, business_profile_id: business.id, delivery_id: delivery.id, vendor_name: vendor.store.name, request_items: [{ text: items }], purchase_budget_ngn: budget, delivery_fee_ngn: deliveryFee, service_fee_ngn: SERVICE_FEE_NGN, customer_total_ngn: total }).select("id").single<{ id: string }>();
    if (errandError || !errand) {
      await db.from("deliveries").update({ status: "cancelled" }).eq("id", delivery.id);
      throw errandError || new Error("Could not create FastErrand.");
    }
    const intent = await createPaymentIntent(db, { reference, internalReference: `fast-errand:${errand.id}`, purpose: "delivery_payment", ownerUserId: user.id, amountNgn: total, deliveryId: delivery.id });
    const callbackUrl = new URL(`${paymentCallbackOrigin(request)}/fast-errands/callback`);
    callbackUrl.searchParams.set("reference", reference);
    callbackUrl.searchParams.set("code", errandCode);
    try {
      const checkout = await initiateSquadPayment({ amountNgn: total, email, reference, callbackUrl: callbackUrl.toString(), customerName: phone || email, metadata: { purpose: "fast_errand_payment", fast_errand_id: errand.id, errand_code: errandCode } });
      await markPaymentIntentPending(db, intent.id);
      return NextResponse.json({ authorizationUrl: checkout.authorizationUrl, reference, errandCode });
    } catch {
      await markPaymentIntentInitializationFailed(db, intent.id).catch(() => undefined);
      await db.from("fast_errand_orders").update({ status: "cancelled" }).eq("id", errand.id);
      await db.from("deliveries").update({ status: "cancelled" }).eq("id", delivery.id);
      return NextResponse.json({ error: "FastErrands payment could not start. Your card has not been charged." }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Could not create FastErrand checkout." }, { status: 500 });
  }
}
