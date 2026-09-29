import type { SupabaseClient } from "@supabase/supabase-js";

/** Server-only context persistence after ownership was verified by the support route. */
export async function attachSupportDeliveryContext(db: SupabaseClient, ticketId: string, delivery: { id: string; deliveryCode: string }) {
  const { error } = await db.from("support_tickets").update({ delivery_id: delivery.id, tracking_code: delivery.deliveryCode, last_activity_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) throw new Error("Could not attach the verified delivery context.");
  const { error: linkError } = await db.from("support_case_links").upsert({ ticket_id: ticketId, delivery_id: delivery.id, link_role: "primary" }, { onConflict: "ticket_id,delivery_id" });
  if (linkError) throw new Error("Could not attach the support case context.");
}

/** Compensation for a newly-created case when verified context cannot be persisted. */
export async function deleteNewSupportTicket(db: SupabaseClient, ticketId: string) {
  const { error } = await db.from("support_tickets").delete().eq("id", ticketId);
  if (error) throw new Error("Could not remove the incomplete support case.");
}

/** A deliberately small Case 360 projection. Never return raw operational rows. */
export async function getSupportCaseContext(db: SupabaseClient, ticketId: string) {
  const { data: links, error } = await db.from("support_case_links").select("delivery_id, order_id, link_role").eq("ticket_id", ticketId).limit(4);
  if (error) throw new Error("Could not load support context.");
  const contexts = [] as Array<Record<string, unknown>>;
  for (const link of links || []) {
    if (link.delivery_id) {
      const { data } = await db.from("deliveries").select("id, delivery_code, status, vehicle_type, delivery_speed, accepted_at, picked_up_at, delivered_at, created_at, updated_at").eq("id", link.delivery_id).maybeSingle();
      if (data) contexts.push({ kind: "delivery", reference: data.delivery_code, status: data.status, vehicleType: data.vehicle_type, serviceSpeed: data.delivery_speed, acceptedAt: data.accepted_at, pickedUpAt: data.picked_up_at, deliveredAt: data.delivered_at, createdAt: data.created_at, updatedAt: data.updated_at, role: link.link_role });
    }
    if (link.order_id) {
      const { data } = await db.from("orders").select("id, order_code, marketplace_kind, status, payment_status, items, delivery_id, created_at, updated_at, business_profiles(business_name), deliveries(delivery_code, status)").eq("id", link.order_id).maybeSingle();
      if (data) { const business = Array.isArray(data.business_profiles) ? data.business_profiles[0] : data.business_profiles; const delivery = Array.isArray(data.deliveries) ? data.deliveries[0] : data.deliveries; contexts.push({ kind: "order", reference: data.order_code, source: data.marketplace_kind, status: data.status, paymentStatus: data.payment_status, itemCount: Array.isArray(data.items) ? data.items.length : 0, businessName: business?.business_name || null, deliveryReference: delivery?.delivery_code || null, deliveryStatus: delivery?.status || null, createdAt: data.created_at, updatedAt: data.updated_at, role: link.link_role }); }
    }
  }
  return contexts;
}
