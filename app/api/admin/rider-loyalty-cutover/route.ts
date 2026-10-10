import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";

const confirmationText = "CONVERT RIDER SANDBOX BALANCES";

type RiderCutoverRow = {
  wallet_id: string;
  convertible_sandbox_ngn: number | string | null;
  projected_loyalty_credit_ngn: number | string | null;
  protected_cash_ngn: number | string | null;
  pre_live_sandbox_source_ngn: number | string | null;
};

export async function GET() {
  if (!(await requireAdminSession())) return response({ error: "Admin session required." }, 401);
  const db = createAdminClient();
  if (!db) return response({ error: "Supabase admin access is required for the rider preview." }, 503);

  const { data, error } = await db.rpc("preview_rider_sandbox_loyalty_cutover");
  if (error) return response({ error: "Rider cash protection is unavailable until its database migration is installed." }, 503);
  const rows = (data || []) as RiderCutoverRow[];
  const sum = (key: keyof RiderCutoverRow) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  return response({
    dryRun: true,
    rule: { liveKeyCutoverAt: "2026-09-07T00:37:35+01:00", sandboxNgnPerLoyaltyNgn: 10, riderCashProtected: true },
    scope: {
      riderWalletsReviewed: rows.length,
      riderWalletsToConvert: rows.filter((row) => Number(row.convertible_sandbox_ngn || 0) > 0).length,
      riderSandboxSourceBalanceNgn: sum("convertible_sandbox_ngn"),
      riderProjectedLoyaltyCreditNgn: sum("projected_loyalty_credit_ngn"),
      riderProtectedCashNgn: sum("protected_cash_ngn"),
      riderPreLiveSandboxSourceNgn: sum("pre_live_sandbox_source_ngn")
    },
    warning: "This operation only reads or updates wallets whose wallet_type is rider. Customer, business, platform, and investor balances are excluded.",
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
  if (confirmation !== confirmationText) return response({ error: `Type “${confirmationText}” exactly to run the rider conversion.` }, 400);
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(reference)) return response({ error: "Use a unique conversion reference of 8–120 letters, numbers, colons, underscores, or hyphens." }, 400);

  const db = createAdminClient();
  if (!db) return response({ error: "Supabase admin access is required for the rider conversion." }, 503);
  const { data, error } = await db.rpc("run_rider_sandbox_loyalty_cutover", { next_reference: reference });
  if (error) return response({ error: error.message }, 400);
  return response({ ok: true, result: data });
}

function response(body: Record<string, unknown>, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
