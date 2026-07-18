import type { SupabaseClient } from "@supabase/supabase-js";
import { mapSafeLegacyPaymentIntents } from "@/lib/payments/legacy-payment-intents";
import { settleSquadPayment } from "@/lib/payments/settlement";

export async function reconcileSquadPayments(db: SupabaseClient, limit = 20) {
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const legacyMapped = await mapSafeLegacyPaymentIntents(db, Math.min(10, boundedLimit));
  const threshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("payment_intents")
    .select("id, provider_transaction_reference")
    .in("status", ["initialized", "pending"])
    .lt("created_at", threshold)
    .order("created_at", { ascending: true })
    .limit(boundedLimit);
  if (error) throw new Error("PAYMENT_RECONCILIATION_LOOKUP_FAILED");

  const summary = { scanned: 0, settled: 0, pending: 0, review: 0, failed: 0, retryable: 0, legacyMapped };
  for (const intent of data || []) {
    const reference = String(intent.provider_transaction_reference || "");
    if (!reference) continue;
    summary.scanned += 1;
    try {
      const result = await settleSquadPayment(db, { reference, actor: { type: "reconciliation" } });
      if (result.status === "settled" || result.status === "already_settled") summary.settled += 1;
      else if (result.status === "pending") summary.pending += 1;
      else if (result.status === "failed") summary.failed += 1;
      else if (result.status === "requires_review") summary.review += 1;
      else summary.retryable += 1;
    } catch {
      summary.retryable += 1;
    }
  }
  return summary;
}
