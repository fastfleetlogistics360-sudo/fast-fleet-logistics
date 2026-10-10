import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";

const confirmationText = "CLOSE TEST DATA AND PREPARE LIVE";

type RiderCutoverRow = {
  wallet_id: string;
  current_balance_ngn: number | string | null;
  convertible_sandbox_ngn: number | string | null;
  projected_loyalty_credit_ngn: number | string | null;
  legacy_untagged_credit_ngn: number | string | null;
};

/**
 * Deliberately API-only: this lets an authorised admin inspect the exact scope
 * before a production cutover without putting an irreversible control in the
 * everyday operations screen.
 */
export async function GET() {
  if (!(await requireAdminSession())) return response({ error: "Admin session required." }, 401);
  const db = createAdminClient();
  if (!db) return response({ error: "Supabase admin access is required for the LIVE cutover preview." }, 503);

  const [activeDeliveries, convertibleWallets, pendingSquadTransactions, pendingPaymentIntents, lockedWallets, riderPreview] = await Promise.all([
    db.from("deliveries").select("id", { count: "exact", head: true }).not("status", "in", "(delivered,cancelled)"),
    db.from("wallets").select("balance_ngn").eq("wallet_type", "customer").gt("balance_ngn", 0),
    db.from("transactions").select("id", { count: "exact", head: true }).eq("provider", "squad").eq("status", "pending"),
    db.from("payment_intents").select("id", { count: "exact", head: true }).in("status", ["initialized", "pending"]),
    db.from("wallets").select("id, locked_balance_ngn").gt("locked_balance_ngn", 0),
    db.rpc("preview_rider_sandbox_loyalty_cutover")
  ]);

  const firstError = [activeDeliveries.error, convertibleWallets.error, pendingSquadTransactions.error, pendingPaymentIntents.error, lockedWallets.error].find(Boolean);
  if (firstError) return response({ error: firstError.message }, 400);

  const sourceBalanceNgn = (convertibleWallets.data || []).reduce((sum, wallet) => sum + Number(wallet.balance_ngn || 0), 0);
  const lockedBalanceNgn = (lockedWallets.data || []).reduce((sum, wallet) => sum + Number(wallet.locked_balance_ngn || 0), 0);
  const riderRows = (riderPreview.data || []) as RiderCutoverRow[];
  const riderMigrationAvailable = !riderPreview.error;
  const riderSandboxSourceBalanceNgn = riderRows.reduce((sum, wallet) => sum + Number(wallet.convertible_sandbox_ngn || 0), 0);
  const riderLoyaltyCreditNgn = riderRows.reduce((sum, wallet) => sum + Number(wallet.projected_loyalty_credit_ngn || 0), 0);
  const riderLegacyUntaggedCreditNgn = riderRows.reduce((sum, wallet) => sum + Number(wallet.legacy_untagged_credit_ngn || 0), 0);
  const riderWalletsToConvert = riderRows.filter((wallet) => Number(wallet.convertible_sandbox_ngn || 0) > 0).length;
  const riderWarnings = !riderMigrationAvailable
    ? ["Rider cash protection is unavailable until the rider sandbox-loyalty migration is installed."]
    : riderLegacyUntaggedCreditNgn > 0
      ? ["Rider credits without an explicit sandbox/live marker are protected as cash and will not be converted automatically."]
      : [];
  return response({
    dryRun: true,
    rule: { sandboxNgnPerLoyaltyNgn: 10, loyaltyUse: "platform_fee_only", investorBalancesChanged: false },
    scope: {
      activeDeliveries: activeDeliveries.count || 0,
      customerOrBusinessWalletsToConvert: (convertibleWallets.data || []).length,
      sandboxSourceBalanceNgn: sourceBalanceNgn,
      projectedLoyaltyCreditNgn: Math.round(sourceBalanceNgn * 10) / 100,
      pendingSquadTransactions: pendingSquadTransactions.count || 0,
      pendingPaymentIntents: pendingPaymentIntents.count || 0,
      lockedWallets: (lockedWallets.data || []).length,
      lockedBalanceNgn,
      riderMigrationAvailable,
      riderWalletsToConvert,
      riderSandboxSourceBalanceNgn,
      riderProjectedLoyaltyCreditNgn: riderLoyaltyCreditNgn,
      riderLegacyUntaggedCreditNgn
    },
    warnings: [
      ...(lockedBalanceNgn > 0 ? ["There are locked balances. The cutover will release pending withdrawal holds first, then convert the resulting customer/business balance at the 10:1 loyalty rate."] : []),
      ...riderWarnings
    ],
    execute: { confirmationText, requiresUniqueReference: true }
  });
}

export async function POST(request: Request) {
  if (!(await requireAdminSession(request))) return response({ error: "Admin session required." }, 401);
  const limited = await enforceAdminMutationRateLimit(request, "destructive");
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as { confirmation?: unknown; reference?: unknown };
  const confirmation = String(body.confirmation || "").trim();
  const reference = String(body.reference || "").trim();
  if (confirmation !== confirmationText) return response({ error: `Type “${confirmationText}” exactly to run the cutover.` }, 400);
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(reference)) return response({ error: "Use a unique cutover reference of 8–120 letters, numbers, colons, underscores, or hyphens." }, 400);

  const db = createAdminClient();
  if (!db) return response({ error: "Supabase admin access is required for the LIVE cutover." }, 503);
  const { data, error } = await db.rpc("run_sandbox_live_cutover", { next_reference: reference });
  if (error) return response({ error: error.message }, 400);
  return response({ ok: true, result: data, nextStep: "Set the LIVE Squad credentials only after reviewing this result." });
}

function response(body: Record<string, unknown>, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
