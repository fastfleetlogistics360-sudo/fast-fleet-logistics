import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/support/cases";
import { recordSupportEvent } from "@/lib/support/events";

export type SupportContextActor = { userId: string; kind: "customer" | "rider" | "business" | "investor" | "admin" };
export type SupportContextCandidate = { type: "delivery" | "order"; id: string };

export async function authorizeSupportContextLink(db: SupabaseClient, actor: SupportContextActor, candidate: SupportContextCandidate) {
  if (!isUuid(candidate.id)) return null;
  if (candidate.type === "delivery") {
    const { data } = await db.from("deliveries").select("id, delivery_code, customer_id, rider_profiles:rider_profiles!deliveries_rider_id_fkey(user_id)").eq("id", candidate.id).maybeSingle<any>();
    if (!data) return null;
    const riderUserId = data.rider_profiles?.user_id;
    if (actor.kind !== "admin" && data.customer_id !== actor.userId && riderUserId !== actor.userId) return null;
    return { type: candidate.type, id: data.id, reference: data.delivery_code || data.id };
  }
  const { data } = await db.from("orders").select("id, order_code, customer_id, business_profiles(user_id), delivery_id").eq("id", candidate.id).maybeSingle<any>();
  if (!data) return null;
  if (actor.kind !== "admin" && data.customer_id !== actor.userId && data.business_profiles?.user_id !== actor.userId) return null;
  return { type: candidate.type, id: data.id, reference: data.order_code || data.id, deliveryId: data.delivery_id || null };
}

export async function attachVerifiedSupportContext(db: SupabaseClient, ticketId: string, actor: SupportContextActor, candidate: SupportContextCandidate) {
  const context = await authorizeSupportContextLink(db, actor, candidate);
  if (!context) throw new Error("Support context is unavailable.");
  const column = context.type === "delivery" ? "delivery_id" : "order_id";
  const { error } = await db.from("support_case_links").upsert({ ticket_id: ticketId, [column]: context.id, link_role: "primary", created_by: actor.userId }, { onConflict: `ticket_id,${column}` });
  if (error) throw new Error("Could not attach support context.");
  await recordSupportEvent(db, { ticketId, actorUserId: actor.userId, actorType: actor.kind === "admin" ? "agent" : "customer", eventType: "CONTEXT_LINKED", metadata: { type: context.type, reference: context.reference } });
  return context;
}
