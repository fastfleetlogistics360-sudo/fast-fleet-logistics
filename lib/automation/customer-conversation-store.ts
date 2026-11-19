import type { SupabaseClient } from "@supabase/supabase-js";

export type StoredConversation = { id: string; title: string; preview: string | null; updated_at: string; messages?: StoredMessage[] };
export type StoredMessage = { id: string; role: "user" | "assistant"; body: string; provider: "groq" | "deterministic" | null; response_mode: "generative" | "deterministic_fallback" | null; created_at: string };

export async function saveCustomerConversationTurn(
  db: SupabaseClient,
  input: { userId: string; conversationId?: string | null; question: string; answer: string; provider: "groq" | "deterministic"; mode: "generative" | "deterministic_fallback" }
) {
  let conversationId = input.conversationId || null;
  if (conversationId) {
    const { data } = await db.from("assistant_conversations").select("id").eq("id", conversationId).eq("user_id", input.userId).maybeSingle<{ id: string }>();
    if (!data) conversationId = null;
  }
  if (!conversationId) {
    const title = input.question.replace(/\s+/g, " ").trim().slice(0, 120) || "New FAST AI conversation";
    const { data, error } = await db.from("assistant_conversations").insert({ user_id: input.userId, title }).select("id").single<{ id: string }>();
    if (error || !data) throw error || new Error("Could not create your FAST AI conversation.");
    conversationId = data.id;
  }
  const { error } = await db.from("assistant_messages").insert([
    { conversation_id: conversationId, role: "user", body: input.question },
    { conversation_id: conversationId, role: "assistant", body: input.answer, provider: input.provider, response_mode: input.mode }
  ]);
  if (error) throw error;
  return conversationId;
}

export async function listCustomerConversations(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("assistant_conversations").select("id, title, preview, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(30);
  if (error) throw error;
  return (data || []) as StoredConversation[];
}

export async function loadCustomerConversation(db: SupabaseClient, userId: string, conversationId: string) {
  const { data: conversation, error: conversationError } = await db.from("assistant_conversations").select("id, title, preview, updated_at").eq("id", conversationId).eq("user_id", userId).maybeSingle<StoredConversation>();
  if (conversationError) throw conversationError;
  if (!conversation) return null;
  const { data: messages, error: messagesError } = await db.from("assistant_messages").select("id, role, body, provider, response_mode, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(100);
  if (messagesError) throw messagesError;
  return { ...conversation, messages: (messages || []) as StoredMessage[] };
}
