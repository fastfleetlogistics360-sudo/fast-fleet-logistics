import type { SupabaseClient } from "@supabase/supabase-js";
import { recordDeliveryIncome } from "@/lib/company-ledger";
import {
  businessPickupAddressFor,
  loadActiveLinkedBusiness,
  resolveMarketplaceBusinessLinks,
  type MarketplaceCheckoutItem
} from "@/lib/marketplace-business-links";
import type { Json } from "@/lib/supabase/types";
import { creditBusinessOrderWallet, recordCustomerMarketplacePayment } from "@/lib/wallet-ledger";

type MarketplaceDeliveryRow = {
  id: string;
  delivery_code?: string | null;
  customer_id?: string | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  dropoff_contact?: string | null;
  parcel_type?: string | null;
  vehicle_type?: string | null;
  payment_method?: string | null;
  status?: string | null;
  price_ngn?: number | string | null;
  distance_km?: number | string | null;
  eta_minutes?: number | string | null;
  metadata?: unknown;
  created_at?: string | null;
};

type ConvertedOrderRow = {
  id: string;
  order_code?: string | null;
  business_id?: string | null;
  business_profile_id?: string | null;
  amount?: number | string | null;
  marketplace_kind?: string | null;
};

export async function convertMarketplaceDeliveryToBusinessOrder(
  db: SupabaseClient,
  delivery: MarketplaceDeliveryRow,
  options: {
    amountNgn?: number;
    providerData?: Record<string, unknown> | null;
    targetBusinessProfileId?: string | null;
  } = {}
) {
  const metadata = metadataRecord(delivery.metadata);
  const reference = text(delivery.delivery_code);
  const rawItems = Array.isArray(metadata.items) ? metadata.items as MarketplaceCheckoutItem[] : [];
  if (!reference || !delivery.customer_id || !rawItems.length) return null;

  const kind = metadata.kind === "shopping" ? "shopping" : "restaurant";
  const resolution = await resolveMarketplaceBusinessLinks(db, kind, rawItems);
  if (resolution.linkedBusinessIds.length !== 1 || resolution.hasUnlinkedItems) return null;
  const businessProfileId = resolution.linkedBusinessIds[0];
  if (options.targetBusinessProfileId && businessProfileId !== options.targetBusinessProfileId) return null;

  const business = await loadActiveLinkedBusiness(db, businessProfileId);
  if (!business) return null;

  const existing = await db
    .from("orders")
    .select("id, order_code, business_id, business_profile_id, amount, marketplace_kind")
    .eq("order_code", reference)
    .maybeSingle<ConvertedOrderRow>();
  if (existing.error) throw existing.error;

  const amount = Math.max(0, Math.round(Number(options.amountNgn ?? delivery.price_ngn ?? 0)));
  const pickupAddress = businessPickupAddressFor(business, delivery.pickup_address || "Marketplace pickup");
  const orderPayload = {
    order_code: reference,
    customer_id: delivery.customer_id,
    business_id: business.user_id,
    business_profile_id: business.id,
    marketplace_kind: kind,
    items: resolution.items as unknown as Json,
    customer_contact: delivery.dropoff_contact || null,
    pickup_address: pickupAddress,
    dropoff_address: delivery.dropoff_address || "Customer delivery address",
    package_type: kind === "shopping" ? "shopping items" : "food order",
    vehicle_type: normalizeVehicle(delivery.vehicle_type),
    status: "received",
    amount,
    payment_method: normalizePaymentMethod(delivery.payment_method),
    payment_status: "paid"
  };

  const order = existing.data?.id && existing.data.business_id
    ? existing.data
    : existing.data?.id
      ? await updateConvertedOrder(db, existing.data.id, orderPayload)
      : await insertConvertedOrder(db, orderPayload);

  await Promise.allSettled([
    creditBusinessOrderWallet(db, order.id),
    recordCustomerMarketplacePayment(db, {
      userId: delivery.customer_id,
      amountNgn: amount,
      providerReference: reference,
      orderId: order.id,
      orderCode: reference,
      marketplaceKind: kind,
      metadata: {
        business_id: business.user_id,
        business_profile_id: business.id,
        repaired_from_delivery_id: delivery.id
      }
    }),
    recordDeliveryIncome({
      amountNgn: amount,
      deliveryCode: reference,
      paymentMethod: normalizePaymentMethod(delivery.payment_method),
      reference,
      counterparty: delivery.customer_id,
      notes: "Squad marketplace checkout was linked to a business order."
    }),
    db.from("notifications").insert({
      user_id: business.user_id,
      title: "New paid marketplace order",
      body: `${reference} is paid and waiting for your team to prepare.`,
      type: "business_order_received",
      channel: "in_app",
      metadata: { order_id: order.id, order_code: reference, business_profile_id: business.id }
    }),
    db.from("notifications").insert({
      user_id: delivery.customer_id,
      title: "Marketplace payment confirmed",
      body: `${reference} has been sent to the business.`,
      type: "order_update",
      channel: "in_app",
      metadata: { order_id: order.id, order_code: reference, status: "received" }
    }),
    db
      .from("deliveries")
      .update({
        status: "cancelled",
        metadata: {
          ...metadata,
          converted_to_business_order_id: order.id,
          converted_to_business_order_at: new Date().toISOString(),
          converted_to_business_profile_id: business.id,
          original_marketplace_delivery_status: delivery.status || null,
          provider_paid_at: typeof options.providerData?.created_at === "string" ? options.providerData.created_at : metadata.provider_paid_at || new Date().toISOString(),
          provider_status: options.providerData?.transaction_status ?? metadata.provider_status ?? "Success",
          provider_channel: options.providerData?.transaction_type ?? metadata.provider_channel ?? null,
          squad_gateway_reference: options.providerData?.gateway_transaction_ref ?? metadata.squad_gateway_reference ?? null,
          squad_raw: options.providerData ?? metadata.squad_raw ?? null
        } as unknown as Json
      })
      .eq("id", delivery.id)
  ]);

  return {
    kind: "business_order",
    orderId: order.id,
    orderCode: reference,
    amount,
    businessAmount: businessGoodsAmount(resolution.items, amount),
    status: "successful"
  };
}

export async function repairMarketplaceDeliveriesForBusiness(db: SupabaseClient, businessProfileId: string) {
  const { data, error } = await db
    .from("deliveries")
    .select("id, delivery_code, customer_id, pickup_address, dropoff_address, dropoff_contact, parcel_type, vehicle_type, payment_method, status, price_ngn, distance_km, eta_minutes, metadata, created_at")
    .contains("metadata", { source: "fastfleet_marketplace" })
    .order("created_at", { ascending: false })
    .limit(80)
    .returns<MarketplaceDeliveryRow[]>();
  if (error || !data?.length) return 0;

  let repaired = 0;
  for (const delivery of data) {
    const metadata = metadataRecord(delivery.metadata);
    if (metadata.converted_to_business_order_id || !isVerifiedMarketplacePayment(metadata)) continue;
    const converted = await convertMarketplaceDeliveryToBusinessOrder(db, delivery, { targetBusinessProfileId: businessProfileId });
    if (converted) repaired += 1;
  }
  return repaired;
}

function isVerifiedMarketplacePayment(metadata: Record<string, unknown>) {
  return Boolean(metadata.provider_paid_at || String(metadata.provider_status || "").toLowerCase() === "success");
}

async function insertConvertedOrder(db: SupabaseClient, payload: Record<string, unknown>) {
  const { data, error } = await db.from("orders").insert(payload).select("id, order_code, business_id, business_profile_id, amount, marketplace_kind").single<ConvertedOrderRow>();
  if (error) throw error;
  return data;
}

async function updateConvertedOrder(db: SupabaseClient, id: string, payload: Record<string, unknown>) {
  const { data, error } = await db
    .from("orders")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, order_code, business_id, business_profile_id, amount, marketplace_kind")
    .single<ConvertedOrderRow>();
  if (error) throw error;
  return data;
}

function businessGoodsAmount(items: MarketplaceCheckoutItem[], fallbackTotal: number) {
  const total = items.reduce((sum, item) => {
    const subtotal = Math.round(Number(item.subtotal || 0));
    if (subtotal > 0) return sum + subtotal;
    return sum + Math.round(Number(item.price || 0)) * Math.max(1, Math.round(Number(item.quantity || 1)));
  }, 0);
  if (total > 0) return total;
  return Math.max(0, Math.round(fallbackTotal));
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeVehicle(value: unknown) {
  const vehicle = text(value).toLowerCase();
  return vehicle === "car" || vehicle === "van" ? vehicle : "bike";
}

function normalizePaymentMethod(value: unknown) {
  const method = text(value).toLowerCase();
  return method === "wallet" || method === "transfer" ? method : "card";
}

function text(value: unknown) {
  return String(value || "").trim();
}
