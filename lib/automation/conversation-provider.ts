/**
 * Phase 2B provider boundary. No external provider is enabled by default.
 * Future providers must implement this server-only contract and may only
 * receive the already-authorised, minimised intelligence summary.
 */
export type ConversationProviderId = "deterministic" | "external_unconfigured";
export type ConversationProvider = { id: ConversationProviderId; configured: boolean; model: string | null };

export function configuredConversationProvider(): ConversationProvider {
  const requested = process.env.FAST_AI_PROVIDER?.trim().toLowerCase();
  const model = process.env.FAST_AI_MODEL?.trim() || null;
  // An external provider is intentionally not activated merely because a name
  // is present. A reviewed server-only adapter is required in a later phase.
  if (requested && requested !== "deterministic") return { id: "external_unconfigured", configured: false, model };
  return { id: "deterministic", configured: true, model: null };
}
