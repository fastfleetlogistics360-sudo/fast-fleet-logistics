import type { SupabaseClient } from "@supabase/supabase-js";

/** Server-only context persistence after ownership was verified by the support route. */
export async function attachSupportDeliveryContext(db: SupabaseClient, ticketId: string, delivery: { id: string; deliveryCode: string }) {
  const { error } = await db.from("support_tickets").update({ delivery_id: delivery.id, tracking_code: delivery.deliveryCode, last_activity_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) throw new Error("Could not attach the verified delivery context.");
}
