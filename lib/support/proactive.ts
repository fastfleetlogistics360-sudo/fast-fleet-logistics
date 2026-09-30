import type { SupabaseClient } from "@supabase/supabase-js";

type ProactiveResult = { ticket_id?: string; created?: boolean };

export function fastConfirmDisputeIncidentKey(deliveryId: string, flaggedAt: string) {
  return `fastconfirm:pickup-proof-dispute:${deliveryId}:${new Date(flaggedAt).toISOString()}`;
}

export async function createFastConfirmProactiveCase(db: SupabaseClient, input: { deliveryId: string; customerId: string; flaggedAt: string }) {
  const client = db as unknown as { rpc: (name: string, values: Record<string, unknown>) => Promise<{ data: ProactiveResult | ProactiveResult[] | null; error: { message?: string } | null }> };
  const { data, error } = await client.rpc("create_proactive_support_case_atomic", {
    next_incident_key: fastConfirmDisputeIncidentKey(input.deliveryId, input.flaggedAt),
    next_user_id: input.customerId,
    next_delivery_id: input.deliveryId,
    next_subject: "A delivery check needs support attention",
    next_customer_message: "We are reviewing a delivery check and will update you if we need anything else."
  });
  if (error) throw new Error("Could not create proactive Care360 case.");
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.ticket_id) throw new Error("Could not create proactive Care360 case.");
  return { ticketId: result.ticket_id, created: result.created === true };
}
