import type { SupabaseClient } from "@supabase/supabase-js";
import { deliveryConfirmationOwnerIds, type DeliveryConfirmationTarget } from "@/lib/delivery-confirmation";
import { releaseBicycleAssetForDelivery } from "@/lib/fleet-assets";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { accountMessengerHref } from "@/lib/tracking-links";
import { creditRiderDeliveryWallet } from "@/lib/wallet-ledger";

export type DeliveryForCompletion = DeliveryConfirmationTarget & {
  rider_id?: string | null;
};

export async function finalizeConfirmedDelivery(
  db: SupabaseClient,
  delivery: DeliveryForCompletion,
  actorUserId: string,
  method: "delivery_pin" | "customer_app" | "admin_override"
) {
  const timestamp = new Date().toISOString();
  const { data: completed, error: completionError } = await db
    .from("deliveries")
    .update({ status: "delivered", delivered_at: timestamp, updated_at: timestamp })
    .eq("id", delivery.id)
    .eq("status", "awaiting_delivery_confirmation")
    .select("id, delivery_code, customer_id, rider_id, dropoff_contact, status, metadata, delivered_at")
    .maybeSingle<DeliveryForCompletion & { delivered_at?: string | null }>();
  if (completionError) throw completionError;

  if (!completed?.id) {
    const { data: current, error } = await db.from("deliveries").select("id, status").eq("id", delivery.id).maybeSingle<{ id: string; status?: string | null }>();
    if (error) throw error;
    if (current?.status !== "delivered") throw new Error("This delivery is not awaiting confirmation.");
  }

  const metadata = metadataRecord(delivery.metadata);
  const businessOrderId = stringValue(metadata.business_order_id);
  const riderUserId = await loadRiderUserId(db, delivery.rider_id);
  let order: { id: string; customer_id?: string | null; business_id?: string | null } | null = null;
  if (businessOrderId) {
    try {
      order = await completeLinkedOrder(db, businessOrderId, riderUserId, timestamp);
    } catch {
      // Delivery completion and rider settlement remain authoritative. A later
      // reconciliation can safely repeat the idempotent linked-order update.
    }
  }

  await Promise.allSettled([
    db
      .from("delivery_confirmations")
      .update({ status: "verified", verified_at: timestamp, verified_by: actorUserId, verification_method: method, updated_at: timestamp })
      .eq("delivery_id", delivery.id)
      .in("status", ["pending", "expired", "locked"]),
    db.from("delivery_events").insert({
      delivery_id: delivery.id,
      actor_id: actorUserId,
      status: "delivered",
      title: "Delivery confirmed",
      body: method === "delivery_pin" ? "Recipient PIN verified. Delivery completed." : method === "customer_app" ? "Customer confirmed the handoff in the messenger." : "Delivery completed by an administrator."
    }),
    db.from("delivery_locations").update({ status: "delivered", updated_at: timestamp }).eq("order_id", delivery.id),
    releaseBicycleAssetForDelivery(db, delivery.id)
  ]);

  const deliveryCode = delivery.delivery_code || delivery.id;
  const directOwners = deliveryConfirmationOwnerIds(delivery);
  const notificationTargets = [
    ...directOwners.map((userId) => ({ userId, type: "delivery_completed" })),
    ...(order?.customer_id ? [{ userId: order.customer_id, type: "order_update" }] : []),
    ...(order?.business_id ? [{ userId: order.business_id, type: "business_order_update" }] : [])
  ].filter((item, index, values) => values.findIndex((other) => other.userId === item.userId) === index);
  await Promise.allSettled(
    notificationTargets.map(({ userId, type }) =>
      insertNotificationWithPush(db, {
        user_id: userId,
        title: "Delivery confirmed",
        body: `${deliveryCode} was confirmed and completed successfully.`,
        type,
        metadata: { delivery_id: delivery.id, delivery_code: deliveryCode, order_id: businessOrderId, status: "delivered", url: accountMessengerHref(deliveryCode), tag: `ff-delivered-${deliveryCode}` }
      })
    )
  );

  let settlement: { credited: boolean; amount: number; error?: string } = { credited: false, amount: 0 };
  try {
    settlement = await creditRiderDeliveryWallet(db, delivery.id);
  } catch {
    settlement = { credited: false, amount: 0, error: "Delivery was confirmed. Rider settlement will retry safely." };
  }
  return { deliveredAt: completed?.delivered_at || timestamp, settlement };
}

async function loadRiderUserId(db: SupabaseClient, riderProfileId?: string | null) {
  if (!riderProfileId) return null;
  const { data } = await db.from("rider_profiles").select("user_id").eq("id", riderProfileId).maybeSingle<{ user_id?: string | null }>();
  return data?.user_id || null;
}

async function completeLinkedOrder(db: SupabaseClient, orderId: string, riderUserId: string | null, timestamp: string) {
  const patch: Record<string, unknown> = { status: "delivered", delivered_at: timestamp, updated_at: timestamp };
  if (riderUserId) patch.rider_id = riderUserId;
  const { data, error } = await db
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .select("id, customer_id, business_id")
    .maybeSingle<{ id: string; customer_id?: string | null; business_id?: string | null }>();
  if (error) throw error;
  return data || null;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
