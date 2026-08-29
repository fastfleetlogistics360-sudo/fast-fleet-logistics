import { NextResponse } from "next/server";
import { loadFareConfig } from "@/lib/fare-settings";
import { loadFastErrandsFulfilmentBusinessId } from "@/lib/fast-errands-catalog";
import { createCustomerVehicleOptions, customerVehicleSelection } from "@/lib/customer-vehicle-options";
import { businessPickupAddressFor, loadActiveLinkedBusiness } from "@/lib/marketplace-business-links";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { createPaymentIntent, markPaymentIntentInitializationFailed, markPaymentIntentPending } from "@/lib/payments/payment-intents";
import { generatePaymentReference, initiateSquadPayment } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { extractNigerianState } from "@/lib/location/state-matching";
import { normalizeState } from "@/lib/launch-states";

const FAST_ERRAND_FEE_NGN = 500;
const maxQuantityPerItem = 25;

type CheckoutItem = { itemId?: unknown; quantity?: unknown };
type CatalogItemRow = { id: string; category_id: string; name: string; description?: string | null; price_ngn: number; is_active: boolean };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before starting a FastErrand." }, { status: 401 });
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentCreate, name: "fast-errands:checkout" });
    if (limited) return limited;
    const payload = await request.json().catch(() => ({})) as { items?: CheckoutItem[]; note?: unknown; address?: unknown; email?: unknown; phone?: unknown; vehicleOption?: unknown };
    const requestedItems = Array.isArray(payload.items) ? payload.items : [];
    const address = sanitizeAddressText(String(payload.address || ""));
    const email = String(payload.email || user.email || "").trim();
    const phone = String(payload.phone || "").trim().slice(0, 40);
    const note = String(payload.note || "").trim().slice(0, 700);
    const requestedVehicle = customerVehicleSelection(payload.vehicleOption);
    const quantities = new Map<string, number>();
    for (const item of requestedItems) {
      const id = String(item?.itemId || "").trim();
      const quantity = Math.round(Number(item?.quantity || 0));
      if (!id || quantity < 1 || quantity > maxQuantityPerItem) return NextResponse.json({ error: "Choose valid FastErrand items and quantities." }, { status: 400 });
      quantities.set(id, Math.min(maxQuantityPerItem, (quantities.get(id) || 0) + quantity));
    }
    if (!quantities.size || quantities.size > 40 || address.length < 6 || !email.includes("@")) {
      return NextResponse.json({ error: "Add FastErrand items, a delivery address, and a receipt email." }, { status: 400 });
    }
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "FastErrands checkout is temporarily unavailable." }, { status: 503 });
    const fulfilmentBusinessId = await loadFastErrandsFulfilmentBusinessId();
    if (!fulfilmentBusinessId) return NextResponse.json({ error: "FastErrands is not ready to accept orders yet." }, { status: 409 });
    const business = await loadActiveLinkedBusiness(db, fulfilmentBusinessId);
    if (!business) return NextResponse.json({ error: "The FastErrands fulfilment account is not active." }, { status: 409 });

    const ids = [...quantities.keys()];
    const { data: itemRows, error: itemError } = await db.from("fast_errand_catalog_items").select("id, category_id, name, description, price_ngn, is_active").in("id", ids).eq("is_active", true);
    if (itemError || !itemRows || itemRows.length !== ids.length) return NextResponse.json({ error: "One or more FastErrand items are no longer available. Refresh your cart and try again." }, { status: 409 });
    const categoryIds = Array.from(new Set((itemRows as CatalogItemRow[]).map((item) => item.category_id)));
    const { data: activeCategories } = await db.from("fast_errand_categories").select("id, name").in("id", categoryIds).eq("is_active", true);
    if (!activeCategories || activeCategories.length !== categoryIds.length) return NextResponse.json({ error: "One or more FastErrand categories are unavailable. Refresh your cart and try again." }, { status: 409 });
    const categoryNames = new Map((activeCategories as Array<{ id: string; name: string }>).map((category) => [category.id, category.name]));
    const lineItems = (itemRows as CatalogItemRow[]).map((item) => {
      const quantity = quantities.get(item.id) || 1;
      const price = Math.round(Number(item.price_ngn));
      return { item_id: item.id, category_id: item.category_id, category: categoryNames.get(item.category_id) || "FastErrands", name: item.name, description: item.description || null, price, quantity, subtotal: price * quantity };
    });
    const goodsTotal = lineItems.reduce((total, item) => total + item.subtotal, 0);
    if (goodsTotal < 1) return NextResponse.json({ error: "FastErrand pricing could not be calculated." }, { status: 409 });

    const pickup = businessPickupAddressFor(business, "FastErrands fulfilment pickup");
    const pickupState = extractNigerianState(pickup);
    const dropoffState = extractNigerianState(address);
    const businessStates = [normalizeState(business.operating_state)].filter(Boolean);
    if (businessStates.length && (!dropoffState || !businessStates.includes(dropoffState))) return NextResponse.json({ error: `FastErrands currently serves ${businessStates.join(", ")}. Choose a delivery address in one of those states.` }, { status: 409 });
    if (!requestedVehicle || (requestedVehicle.id !== "bicycle" && requestedVehicle.id !== "motorcycle")) return NextResponse.json({ error: "Choose an available Bicycle or Bike rider option." }, { status: 400 });
    const vehicleOption = (await createCustomerVehicleOptions({
      db,
      fareConfig: await loadFareConfig(),
      input: { pickup: { address: pickup }, dropoff: { address }, pickupState, dropoffState, speed: "standard", parcelType: "FastErrands catalogue order", items: lineItems }
    })).find((option) => option.id === requestedVehicle.id);
    if (!vehicleOption || vehicleOption.availability.status === "unavailable") return NextResponse.json({ error: "That rider option is no longer available. Choose another option and try again." }, { status: 409 });
    const quote = vehicleOption.quote;
    const deliveryFee = Math.max(0, Math.round(quote.fare.deliveryFee));
    const orderItems = note ? [...lineItems, { item_id: null, category_id: null, category: "Request note", name: `Customer note: ${note}`, description: null, price: 0, quantity: 1, subtotal: 0 }] : lineItems;
    const total = goodsTotal + deliveryFee + FAST_ERRAND_FEE_NGN;
    const reference = generatePaymentReference("FFE");
    const { data: order, error: orderError } = await db.from("orders").insert({
      order_code: reference,
      customer_id: user.id,
      business_id: business.user_id,
      business_profile_id: business.id,
      marketplace_kind: "fast_errands",
      items: orderItems,
      customer_contact: phone || email,
      pickup_address: pickup,
      dropoff_address: address,
      package_type: "FastErrands catalogue order",
      vehicle_type: quote.vehicle,
      vehicle_subtype: quote.vehicleSubtype,
      status: "pending",
      amount: total,
      delivery_fee_ngn: deliveryFee,
      platform_fee_ngn: FAST_ERRAND_FEE_NGN,
      distance_km: quote.distanceKm,
      eta_minutes: quote.etaMinutes,
      route_source: quote.routeSource,
      route_type: quote.routeType,
      payment_method: "card",
      payment_status: "pending"
    }).select("id, order_code").single<{ id: string; order_code: string }>();
    if (orderError || !order) throw orderError || new Error("Could not create FastErrand order.");
    const intent = await createPaymentIntent(db, { reference, internalReference: `fast-errand-order:${order.id}`, purpose: "marketplace_business_order", ownerUserId: user.id, amountNgn: total, orderId: order.id });
    const callbackUrl = new URL(`${paymentCallbackOrigin(request)}/fast-errands/callback`);
    callbackUrl.searchParams.set("reference", reference);
    callbackUrl.searchParams.set("code", order.order_code);
    try {
      const checkout = await initiateSquadPayment({ amountNgn: total, email, reference, callbackUrl: callbackUrl.toString(), customerName: phone || email, metadata: { purpose: "fast_errand_catalogue_order", order_id: order.id, order_code: order.order_code, note } });
      await markPaymentIntentPending(db, intent.id);
      return NextResponse.json({ authorizationUrl: checkout.authorizationUrl, reference, errandCode: order.order_code });
    } catch {
      await markPaymentIntentInitializationFailed(db, intent.id).catch(() => undefined);
      await db.from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", order.id);
      return NextResponse.json({ error: "FastErrands payment could not start. Your card has not been charged." }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Could not create FastErrand checkout." }, { status: 500 });
  }
}
