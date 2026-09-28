import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCampusProgram, campusFeeMetadata } from "@/lib/campus-program";
import { loadDeliveryPolicy } from "@/lib/delivery-policy";
import { loadFareConfig } from "@/lib/fare-settings";
import { extractNigerianState } from "@/lib/location/state-matching";
import { geocodeAddress } from "@/lib/maps/geocode";
import { estimateMarketplaceCheckout } from "@/lib/marketplace-pricing";
import { MarketplaceOrderTransitionError, parseMarketplaceOrderTransition, transitionCreatesDelivery } from "@/lib/marketplace-order-transitions";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { notifyEligibleRiders } from "@/lib/rider-delivery-opportunities";
import { accountMessengerHref } from "@/lib/tracking-links";
import { sendWhatsAppText } from "@/lib/whatsapp/messages";
import { parseFastErrandV2Snapshot } from "@/lib/fast-errands-order-snapshot";

export const marketplaceOperationsOrderSelect =
  "id, order_code, customer_id, business_id, business_profile_id, delivery_id, marketplace_kind, marketplace_vendor_id, marketplace_vendor_branch_id, marketplace_vendor_snapshot, items, customer_contact, pickup_address, dropoff_address, package_type, vehicle_type, vehicle_subtype, status, amount, payment_status, metadata, created_at, updated_at, delivered_at";

export type MarketplaceWorkflowOrder = Record<string, unknown>;

export type MarketplaceWorkflowActor = {
  userId: string;
  type: "business" | "operator";
  role?: "operator" | "manager";
  /** The dispatch account stays the business account where one exists. */
  dispatchCustomerId: string;
  pickupContact: string;
  businessProfileId?: string | null;
};

/**
 * The single server-side workflow used by both Business Dashboard and
 * Marketplace Operations. Callers authorize the order first; this service
 * owns payment guards, ordered preparation states, delivery idempotency,
 * customer/rider notifications, and operator audit records.
 */
export async function transitionMarketplaceOrder(
  db: SupabaseClient,
  order: MarketplaceWorkflowOrder,
  requestedStatus: unknown,
  actor: MarketplaceWorkflowActor
) {
  const status = parseMarketplaceOrderTransition(requestedStatus);
  assertTransitionIsAllowed(order, status);

  const orderMetadata = record(order.metadata);
  const fastErrandSnapshot = order.marketplace_kind === "fast_errands" ? parseFastErrandV2Snapshot(orderMetadata.fast_errand) : null;
  const orderItems = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : [];
  const snapshot = record(order.marketplace_vendor_snapshot);
  const pickupAddress = fastErrandSnapshot?.fulfilment.origin_address || String(order.pickup_address || snapshot.pickup_address || "Marketplace pickup");
  const pickupState = text(snapshot.state) || pinnedMarketplacePickup(orderItems)?.state || extractNigerianState(pickupAddress);
  if (status === "ready_for_pickup" && !pickupState) {
    throw new MarketplaceWorkflowError("This order needs a saved vendor branch state before it can be released to riders.", 400);
  }

  let deliveryId = text(order.delivery_id) || null;
  if (transitionCreatesDelivery(status, deliveryId)) {
    const [deliveryPolicy, campusProgram, pickupPoint, dropoffPoint] = await Promise.all([
      loadDeliveryPolicy(),
      loadCampusProgram(),
      fastErrandSnapshot?.fulfilment.origin_latitude != null && fastErrandSnapshot.fulfilment.origin_longitude != null
        ? Promise.resolve({ latitude: fastErrandSnapshot.fulfilment.origin_latitude, longitude: fastErrandSnapshot.fulfilment.origin_longitude })
        : pickupCoordinates(snapshot, orderItems, pickupAddress),
      geocodeAddress(String(order.dropoff_address || ""))
    ]);
    // Paid v2 FastErrands never consult mutable marketplace fare rules.
    const estimate = fastErrandSnapshot ? fastErrandSnapshotDeliveryEstimate(fastErrandSnapshot) : await estimateMarketplaceCheckout({
      kind: order.marketplace_kind === "shopping" ? "shopping" : "restaurant",
      items: orderItems as Parameters<typeof estimateMarketplaceCheckout>[0]["items"],
      address: String(order.dropoff_address || ""),
      pickupAddress,
      fareConfig: await loadFareConfig(),
      deliveryPolicy,
      campusProgram,
      vehicleOption: order.vehicle_type === "bike" ? order.vehicle_subtype === "bicycle" ? "bicycle" : "motorcycle" : undefined
    });
    if (!estimate.allowed) throw new MarketplaceWorkflowError(estimate.policyMessage || "This marketplace order cannot be dispatched to that address.", 422);

    const deliveryCode = String(order.order_code || `FF-MARKETPLACE-${Date.now().toString(36).toUpperCase()}`);
    let createdDelivery = true;
    let { data: delivery, error: deliveryError } = await db
      .from("deliveries")
      .insert({
        marketplace_order_id: order.id,
        delivery_code: deliveryCode,
        customer_id: actor.dispatchCustomerId,
        pickup_address: pickupAddress,
        pickup_latitude: pickupPoint?.latitude || null,
        pickup_longitude: pickupPoint?.longitude || null,
        pickup_contact: actor.pickupContact,
        dropoff_address: String(order.dropoff_address || ""),
        dropoff_latitude: dropoffPoint?.latitude || null,
        dropoff_longitude: dropoffPoint?.longitude || null,
        dropoff_contact: String(order.customer_contact || "Marketplace customer"),
        parcel_type: order.package_type || "Marketplace order",
        vehicle_type: estimate.vehicle,
        delivery_speed: estimate.deliverySpeed,
        payment_method: "card",
        status: "searching",
        price_ngn: estimate.campusAdjustment.riderEarningNgn,
        delivery_fee_ngn: estimate.campusAdjustment.riderEarningNgn,
        platform_fee_ngn: estimate.platformFee,
        distance_km: estimate.distanceKm,
        eta_minutes: estimate.etaMinutes,
        route_source: estimate.routeSource,
        route_type: estimate.routeType,
        route_duration_seconds: estimate.durationSeconds,
        vehicle_subtype: estimate.vehicleSubtype,
        metadata: {
          source: "marketplace_business_order",
          business_order_id: order.id,
          business_profile_id: actor.businessProfileId || null,
          marketplace_vendor_id: order.marketplace_vendor_id || null,
          marketplace_vendor_branch_id: order.marketplace_vendor_branch_id || null,
          marketplace_customer_id: order.customer_id || null,
          marketplace_kind: order.marketplace_kind || null,
          ...(fastErrandSnapshot ? { fast_errand: fastErrandSnapshot } : {}),
          items: orderItems,
          pickup_state: estimate.pickupState || pickupState || null,
          dropoff_state: estimate.dropoffState || null,
          pickup_latitude: pickupPoint?.latitude || null,
          pickup_longitude: pickupPoint?.longitude || null,
          dropoff_latitude: dropoffPoint?.latitude || null,
          dropoff_longitude: dropoffPoint?.longitude || null,
          order_total_ngn: Number(order.amount || 0),
          goods_amount_ngn: estimate.itemsTotal,
          delivery_fee_ngn: estimate.deliveryFee,
          platform_fee_ngn: estimate.platformFee,
          route_source: estimate.routeSource,
          route_type: estimate.routeType,
          route_duration_seconds: estimate.durationSeconds,
          bicycle_eligible: estimate.bicycleEligible,
          vehicle_subtype: estimate.vehicleSubtype,
          ...campusFeeMetadata({ program: campusProgram, adjustment: estimate.campusAdjustment }),
          campus_rider_priority_until: estimate.campusAdjustment.applied ? new Date(Date.now() + campusProgram.riderPriorityMinutes * 60_000).toISOString() : null,
          marketplace_vehicle: estimate.vehicle,
          interstate_dispatch: estimate.interstateDispatch,
          interstate_delivery_days: estimate.interstateDeliveryDays
        }
      })
      .select("id, delivery_code")
      .single<{ id: string; delivery_code: string }>();
    if (deliveryError?.code === "23505") {
      createdDelivery = false;
      const existing = await db.from("deliveries").select("id, delivery_code").eq("marketplace_order_id", String(order.id)).maybeSingle<{ id: string; delivery_code: string }>();
      delivery = existing.data;
      deliveryError = existing.error;
    }
    if (deliveryError || !delivery) throw deliveryError || new Error("Could not create Marketplace delivery.");
    deliveryId = delivery.id;
    if (createdDelivery) await Promise.allSettled([
      db.from("delivery_events").insert({ delivery_id: delivery.id, actor_id: actor.userId, status: "searching", title: "Ready for pickup", body: "Marketplace order is ready. Fast Fleets 360 is finding a courier." }),
      notifyEligibleRiders(db, {
        id: delivery.id, delivery_code: delivery.delivery_code, pickup_address: pickupAddress,
        pickup_latitude: pickupPoint?.latitude || null, pickup_longitude: pickupPoint?.longitude || null,
        distance_km: estimate.distanceKm, price_ngn: estimate.campusAdjustment.riderEarningNgn,
        delivery_fee_ngn: estimate.campusAdjustment.riderEarningNgn, vehicle_type: estimate.vehicle,
        vehicle_subtype: estimate.vehicleSubtype,
        metadata: { pickup_state: estimate.pickupState || pickupState || null, vehicle_subtype: estimate.vehicleSubtype, ...campusFeeMetadata({ program: campusProgram, adjustment: estimate.campusAdjustment }), campus_rider_priority_until: estimate.campusAdjustment.applied ? new Date(Date.now() + campusProgram.riderPriorityMinutes * 60_000).toISOString() : null }
      }, deliveryPolicy.rider)
    ]);
  }

  const nextPatch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (deliveryId) nextPatch.delivery_id = deliveryId;
  const { data: updated, error: updateError } = await db.from("orders").update(nextPatch).eq("id", String(order.id)).select(marketplaceOperationsOrderSelect).single();
  if (updateError) throw updateError;

  const code = String(order.order_code || order.id);
  await Promise.allSettled([
    order.customer_id ? insertNotificationWithPush(db, { user_id: String(order.customer_id), title: "Order status updated", body: `${code} is ${status.replaceAll("_", " ")}.`, type: "order_update", metadata: { order_id: order.id, order_code: code, delivery_id: deliveryId, status, url: accountMessengerHref(code), tag: `ff-${code}` } }) : Promise.resolve(),
    actor.type === "business" ? insertNotificationWithPush(db, { user_id: actor.userId, title: status === "ready_for_pickup" ? "Dispatch request sent" : "Business order updated", body: `${code} is ${status.replaceAll("_", " ")}.`, type: "business_order_update", metadata: { order_id: order.id, order_code: code, delivery_id: deliveryId, status, tag: `ff-business-${code}` } }) : Promise.resolve(),
    orderMetadata.source === "whatsapp_ordering" && text(orderMetadata.whatsapp_phone) && String(order.status || "") !== status ? sendWhatsAppText({ to: text(orderMetadata.whatsapp_phone), body: whatsappUpdate(code, status) }) : Promise.resolve(),
    actor.type === "operator" ? db.from("marketplace_audit_events").insert({ marketplace_vendor_id: order.marketplace_vendor_id || null, order_id: order.id, actor_user_id: actor.userId, actor_type: "operator", action: "order_status_transition", previous_state: { status: order.status || null, delivery_id: order.delivery_id || null }, next_state: { status, delivery_id: deliveryId }, metadata: { operator_role: actor.role || "operator", marketplace_vendor_branch_id: order.marketplace_vendor_branch_id || null } }) : Promise.resolve()
  ]);
  return updated;
}

export class MarketplaceWorkflowError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function assertTransitionIsAllowed(order: MarketplaceWorkflowOrder, status: string) {
  if (String(order.payment_status || "").toLowerCase() !== "paid") throw new MarketplaceWorkflowError("Only a verified paid order can enter preparation.", 409);
  const current = String(order.status || "pending");
  const sequence = ["pending", "received", "preparing", "packing", "ready_for_pickup"];
  const from = sequence.indexOf(current);
  const to = sequence.indexOf(status);
  if (from < 0 || to < from || ["rider_assigned", "picked_up", "in_transit", "awaiting_delivery_confirmation", "delivered", "cancelled"].includes(current)) {
    throw new MarketplaceOrderTransitionError("This order can no longer be changed through preparation.");
  }
}

async function pickupCoordinates(snapshot: Record<string, unknown>, items: Array<Record<string, unknown>>, pickupAddress: string) {
  const latitude = number(snapshot.pickup_latitude) ?? pinnedMarketplacePickup(items)?.latitude;
  const longitude = number(snapshot.pickup_longitude) ?? pinnedMarketplacePickup(items)?.longitude;
  return latitude != null && longitude != null ? { latitude, longitude } : geocodeAddress(pickupAddress);
}
function pinnedMarketplacePickup(items: Array<Record<string, unknown>>) { const item = items.find((entry) => Number.isFinite(entry.pickupLatitude) && Number.isFinite(entry.pickupLongitude)); return item ? { state: text(item.vendorState), latitude: Number(item.pickupLatitude), longitude: Number(item.pickupLongitude) } : null; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function whatsappUpdate(code: string, status: string) { if (status === "received") return `${code} update: the business has received your order and will begin preparing it shortly.`; if (status === "preparing") return `${code} update: your order is now being prepared.`; if (status === "packing") return `${code} update: your order is packed and being prepared for dispatch.`; return `${code} update: your order is ready for pickup. We are now finding a rider and will send the rider details here once one accepts.`; }
/** Paid v2 FastErrands never consult mutable marketplace fare rules. */
function fastErrandSnapshotDeliveryEstimate(snapshot: NonNullable<ReturnType<typeof parseFastErrandV2Snapshot>>) {
  const bicycle = snapshot.selected_vehicle.id === "bicycle";
  return {
    allowed: true, policyMessage: null, vehicle: snapshot.selected_vehicle.vehicle, vehicleSubtype: snapshot.selected_vehicle.vehicle_subtype,
    deliverySpeed: "standard" as const, distanceKm: snapshot.display_distance_km,
    etaMinutes: Math.max(1, Math.round(snapshot.road_distance_meters / 1000 / 20 * 60)), routeSource: "google-routes", routeType: "road",
    durationSeconds: Math.max(60, Math.round(snapshot.road_distance_meters / 1000 / 20 * 3600)), deliveryFee: snapshot.service_fee_ngn,
    platformFee: 0, itemsTotal: snapshot.goods_subtotal_ngn, bicycleEligible: bicycle,
    pickupState: extractNigerianState(snapshot.fulfilment.origin_address), dropoffState: null,
    campusAdjustment: { applied: false, campusZoneId: null, deliveryFee: snapshot.service_fee_ngn, platformFee: 0, totalDiscount: 0, riderEarningNgn: snapshot.service_fee_ngn, pricingBand: "normal" as const },
    interstateDispatch: false, interstateDeliveryDays: null
  };
}
