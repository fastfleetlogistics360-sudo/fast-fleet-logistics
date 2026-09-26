import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordSupportEvent(db: SupabaseClient, input: { ticketId: string; actorUserId: string | null; actorType: "customer" | "agent" | "system"; eventType: string; metadata?: Record<string, unknown> }) {
  const { error } = await db.from("support_case_events").insert({ ticket_id: input.ticketId, actor_user_id: input.actorUserId, actor_type: input.actorType, event_type: input.eventType, metadata: input.metadata || {} });
  if (error) throw new Error("Could not record support case history.");
}
