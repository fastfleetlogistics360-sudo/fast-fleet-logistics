import type { SupabaseClient } from "@supabase/supabase-js";
import { loadInvestorProfileForUser } from "@/lib/investors";

type WalletLedgerRow = {
  id: string;
  entry_type: string;
  amount_ngn: number | string | null;
  balance_after_ngn: number | string | null;
  created_at: string;
  fleet_assets: { asset_code: string | null }[] | null;
  investor_delivery_settlements: { gross_delivery_value_ngn: number | string | null; maintenance_reserve_ngn: number | string | null }[] | null;
};

type InvestorWithdrawalRow = {
  id: string;
  amount_ngn: number | string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  paid_at: string | null;
};

export async function loadInvestorWallet(database: SupabaseClient, userId: string) {
  const investor = await loadInvestorProfileForUser(database, userId);
  if (!investor) return null;
  const [walletResult, entriesResult, withdrawalsResult, reservesResult] = await Promise.all([
    database.from("investor_wallets").select("id, available_balance_ngn, locked_balance_ngn, currency").eq("investor_profile_id", investor.id).maybeSingle(),
    database.from("investor_ledger_entries").select("id, entry_type, amount_ngn, balance_after_ngn, created_at, fleet_assets(asset_code), investor_delivery_settlements(gross_delivery_value_ngn, maintenance_reserve_ngn)").eq("investor_profile_id", investor.id).order("created_at", { ascending: false }).limit(30),
    database.from("investor_withdrawal_requests").select("id, amount_ngn, status, rejection_reason, created_at, reviewed_at, paid_at").eq("investor_profile_id", investor.id).order("created_at", { ascending: false }).limit(20),
    database.from("investor_delivery_settlements").select("maintenance_reserve_ngn").eq("investor_profile_id", investor.id)
  ]);
  for (const result of [walletResult, entriesResult, withdrawalsResult, reservesResult]) if (result.error) throw result.error;
  return {
    investor: { id: investor.id, status: investor.status, onboardingCompleted: Boolean(investor.onboarding_completed_at) },
    wallet: {
      availableBalanceNgn: Number(walletResult.data?.available_balance_ngn || 0),
      lockedBalanceNgn: Number(walletResult.data?.locked_balance_ngn || 0),
      currency: walletResult.data?.currency || "NGN"
    },
    maintenanceReserveTotalNgn: (reservesResult.data || []).reduce((sum, row) => sum + Number(row.maintenance_reserve_ngn || 0), 0),
    entries: ((entriesResult.data || []) as WalletLedgerRow[]).map((entry) => ({
      id: entry.id, type: entry.entry_type, amountNgn: Number(entry.amount_ngn || 0), balanceAfterNgn: entry.balance_after_ngn == null ? null : Number(entry.balance_after_ngn), createdAt: entry.created_at,
      assetCode: entry.fleet_assets?.[0]?.asset_code || null, grossDeliveryValueNgn: entry.investor_delivery_settlements?.[0]?.gross_delivery_value_ngn == null ? null : Number(entry.investor_delivery_settlements[0].gross_delivery_value_ngn)
    })),
    withdrawals: ((withdrawalsResult.data || []) as InvestorWithdrawalRow[]).map((request) => ({ id: request.id, amountNgn: Number(request.amount_ngn || 0), status: request.status, rejectionReason: request.rejection_reason, createdAt: request.created_at, reviewedAt: request.reviewed_at, paidAt: request.paid_at }))
  };
}
