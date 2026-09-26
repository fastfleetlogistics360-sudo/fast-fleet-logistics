import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultPriority, defaultQueue, slaDeadlines, type SupportPersona } from "@/lib/support/management";
import { recordSupportEvent } from "@/lib/support/events";
import type { SupportTopicKey } from "@/lib/support/policy";

export async function initializeSupportCaseManagement(db: SupabaseClient, ticketId: string, userId: string | null, topic: SupportTopicKey) {
  const { data: account } = userId ? await db.from("users").select("role").eq("id", userId).maybeSingle<{ role?: string | null }>() : { data: null };
  const persona = ["customer", "rider", "business", "investor"].includes(String(account?.role)) ? String(account?.role) as SupportPersona : "customer";
  const category = topic === "rider_kyc" ? "rider" : topic === "wallet" ? "payment" : topic === "business" ? "business" : topic === "delivery" ? "delivery" : "other";
  const priority = defaultPriority(category); const deadlines = slaDeadlines(priority);
  const { error } = await db.from("support_tickets").update({ persona, category, subcategory: category === "other" ? "general" : category === "rider" ? "account_kyc" : category === "payment" ? "other" : category === "business" ? "account_issue" : "other", support_queue: defaultQueue(category), priority, sla_first_response_at: deadlines.firstResponseAt.toISOString(), sla_resolution_at: deadlines.resolutionAt.toISOString(), last_activity_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) throw new Error("Could not initialize support case management.");
  await recordSupportEvent(db, { ticketId, actorUserId: userId, actorType: userId ? "customer" : "system", eventType: "CASE_CREATED", metadata: { category, persona } });
}
