import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportPriority, SupportTopicKey } from "@/lib/support/policy";

export type AtomicSupportTicketInput = {
  idempotencyKey: string;
  userId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  topic: SupportTopicKey;
  subject: string;
  ticketMessage: string;
  priority: SupportPriority;
  customerMessage: string | null;
  botMessage: string | null;
};

type AtomicSupportTicketResult = {
  ticket_id?: string;
  created?: boolean;
};

export class SupportPersistenceError extends Error {
  constructor() {
    super("Support ticket persistence failed.");
    this.name = "SupportPersistenceError";
  }
}

export async function createSupportTicketAtomic(db: SupabaseClient, input: AtomicSupportTicketInput) {
  const client = db as unknown as {
    rpc: (functionName: string, values: Record<string, unknown>) => Promise<{
      data: AtomicSupportTicketResult | AtomicSupportTicketResult[] | null;
      error: { message?: string } | null;
    }>;
  };
  const { data, error } = await client.rpc("create_support_ticket_with_messages", {
    next_idempotency_key: input.idempotencyKey,
    next_user_id: input.userId,
    next_contact_name: input.contactName,
    next_contact_email: input.contactEmail,
    next_contact_phone: input.contactPhone,
    next_topic: input.topic,
    next_subject: input.subject,
    next_ticket_message: input.ticketMessage,
    next_priority: input.priority,
    next_customer_message: input.customerMessage,
    next_bot_message: input.botMessage
  });

  if (error) throw new SupportPersistenceError();
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.ticket_id) throw new SupportPersistenceError();
  return { ticketId: result.ticket_id, created: result.created === true };
}
