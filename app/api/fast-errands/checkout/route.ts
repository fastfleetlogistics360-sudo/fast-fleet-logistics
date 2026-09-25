import { NextResponse } from "next/server";
import { customerVehicleSelection } from "@/lib/customer-vehicle-options";
import { buildFastErrandV2Snapshot } from "@/lib/fast-errands-order-snapshot";
import { FastErrandQuoteError, resolveFastErrandQuote, type FastErrandRequestedItem } from "@/lib/fast-errands-service-areas";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { createPaymentIntent, markPaymentIntentInitializationFailed, markPaymentIntentPending } from "@/lib/payments/payment-intents";
import { generatePaymentReference, initiateSquadPayment } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sanitizeAddressText } from "@/lib/location/address-formatting";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before starting a FastErrand." }, { status: 401 });
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentCreate, name: "fast-errands:checkout" });
    if (limited) return limited;
    const payload = await request.json().catch(() => ({})) as { items?: FastErrandRequestedItem[]; note?: unknown; address?: unknown; email?: unknown; phone?: unknown; vehicleOption?: unknown; quoteFingerprint?: unknown };
    const address = sanitizeAddressText(String(payload.address || ""));
    const email = String(payload.email || user.email || "").trim();
    const phone = String(payload.phone || "").trim().slice(0, 40);
    const note = String(payload.note || "").trim().slice(0, 700) || null;
    const selectedVehicle = customerVehicleSelection(payload.vehicleOption);
    if (address.length < 6 || !email.includes("@") || !selectedVehicle || !["bicycle", "motorcycle"].includes(selectedVehicle.id)) return NextResponse.json({ error: "Add FastErrand items, a delivery address, receipt email, and available rider option." }, { status: 400 });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "FastErrand checkout is temporarily unavailable." }, { status: 503 });
    const quote = await resolveFastErrandQuote({ db, items: Array.isArray(payload.items) ? payload.items : [], address, selectedVehicle });
    const clientFingerprint = String(payload.quoteFingerprint || "").trim();
    if (clientFingerprint && clientFingerprint !== quote.fingerprint) return NextResponse.json({ error: "Prices or delivery details changed. Review the refreshed FastErrand quote.", quote: safeQuote(quote) }, { status: 409 });
    const vehicle = quote.vehicleOptions.find((option) => option.id === selectedVehicle.id);
    if (!vehicle || vehicle.availability.status === "unavailable") return NextResponse.json({ error: "That rider option is no longer available. Refresh your quote and choose another option." }, { status: 409 });
    const snapshot = buildFastErrandV2Snapshot({
      pricing_mode: "neighborhood", goods_subtotal_ngn: quote.goodsSubtotalNgn, service_fee_ngn: quote.serviceFeeNgn, customer_total_ngn: quote.customerTotalNgn, minimum_cart_ngn: quote.minimumCartNgn, road_distance_meters: quote.roadDistanceMeters,
      service_area: { id: quote.area.id, code: quote.area.code, name: quote.area.name, priority: Number(quote.area.priority), pricing_version: Number(quote.area.pricing_version) },
      pricing_band: { id: quote.band.id, min_distance_exclusive_meters: Number(quote.band.min_distance_exclusive_meters), max_distance_inclusive_meters: Number(quote.band.max_distance_inclusive_meters), service_fee_ngn: quote.serviceFeeNgn },
      fulfilment: { business_profile_id: quote.area.business_profile_id, business_name: quote.business?.business_name || null, origin_address: quote.area.origin_address, origin_place_id: quote.area.origin_place_id, origin_latitude: Number(quote.area.origin_latitude) || null, origin_longitude: Number(quote.area.origin_longitude) || null },
      selected_vehicle: { id: selectedVehicle.id, vehicle: selectedVehicle.vehicle, vehicle_subtype: selectedVehicle.vehicleSubtype, label: selectedVehicle.label }, customer_note: note, quote_fingerprint: quote.fingerprint
    });
    const reference = generatePaymentReference("FFE");
    const { data: order, error: orderError } = await db.from("orders").insert({
      order_code: reference, customer_id: user.id, business_id: quote.business?.user_id, business_profile_id: quote.area.business_profile_id, marketplace_kind: "fast_errands", items: quote.items,
      customer_contact: phone || email, pickup_address: quote.area.origin_address, dropoff_address: address, package_type: "FastErrand neighbourhood procurement", vehicle_type: selectedVehicle.vehicle, vehicle_subtype: selectedVehicle.vehicleSubtype,
      status: "pending", amount: quote.customerTotalNgn, delivery_fee_ngn: quote.serviceFeeNgn, platform_fee_ngn: 0, distance_km: quote.displayDistanceKm, eta_minutes: quote.etaMinutes, route_source: quote.route.source, route_type: "road", payment_method: "card", payment_status: "pending", metadata: { fast_errand: snapshot }
    }).select("id, order_code").single<{ id: string; order_code: string }>();
    if (orderError || !order) throw orderError || new Error("Could not create FastErrand order.");
    const intent = await createPaymentIntent(db, { reference, internalReference: `fast-errand-order:${order.id}`, purpose: "marketplace_business_order", ownerUserId: user.id, amountNgn: quote.customerTotalNgn, orderId: order.id });
    const callbackUrl = new URL(`${paymentCallbackOrigin(request)}/fast-errands/callback`); callbackUrl.searchParams.set("reference", reference); callbackUrl.searchParams.set("code", order.order_code);
    try {
      const checkout = await initiateSquadPayment({ amountNgn: quote.customerTotalNgn, email, reference, callbackUrl: callbackUrl.toString(), customerName: phone || email, metadata: { purpose: "fast_errand_neighborhood_order", order_id: order.id, order_code: order.order_code } });
      await markPaymentIntentPending(db, intent.id);
      return NextResponse.json({ authorizationUrl: checkout.authorizationUrl, reference, errandCode: order.order_code });
    } catch {
      await markPaymentIntentInitializationFailed(db, intent.id).catch(() => undefined);
      await db.from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", order.id);
      return NextResponse.json({ error: "FastErrand payment could not start. Your card has not been charged." }, { status: 502 });
    }
  } catch (error) {
    if (error instanceof FastErrandQuoteError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Could not create FastErrand checkout." }, { status: 500 });
  }
}

function safeQuote(quote: Awaited<ReturnType<typeof resolveFastErrandQuote>>) { return { fingerprint: quote.fingerprint, goodsSubtotalNgn: quote.goodsSubtotalNgn, minimumCartNgn: quote.minimumCartNgn, serviceFeeNgn: quote.serviceFeeNgn, customerTotalNgn: quote.customerTotalNgn, displayDistanceKm: quote.displayDistanceKm, roadDistanceMeters: quote.roadDistanceMeters }; }
