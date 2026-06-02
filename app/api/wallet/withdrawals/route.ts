import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  formatWithdrawalLike,
  MAX_WITHDRAWAL_NGN,
  MIN_WITHDRAWAL_NGN,
  PAYOUT_SLA_HOURS,
  walletTypeForAccountKind,
  withdrawalMetadata,
  withdrawalStatusFromTransaction,
  type WalletAccountKind
} from "@/lib/wallet-ledger";

const withdrawableKinds = new Set(["rider", "business"]);

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const accountKind = normalizeAccountKind(requestUrl.searchParams.get("accountKind"));
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to load withdrawals." }, { status: 401 });

    const db = createAdminClient() || supabase;
    const walletType = walletTypeForAccountKind(accountKind);
    const { data: wallet, error: walletError } = await db
      .from("wallets")
      .select("id")
      .eq("user_id", user.id)
      .eq("wallet_type", walletType)
      .maybeSingle<{ id: string }>();
    if (walletError) throw walletError;
    if (!wallet?.id) return NextResponse.json({ withdrawals: [] });

    const { data, error } = await db
      .from("transactions")
      .select("id, amount_ngn, status, metadata, created_at")
      .eq("wallet_id", wallet.id)
      .eq("transaction_type", "withdrawal")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;

    const withdrawals = (data || [])
      .filter((transaction) => withdrawalMetadata(transaction.metadata).withdrawal_account_kind === accountKind)
      .map((transaction) => {
        const metadata = withdrawalMetadata(transaction.metadata);
        return formatWithdrawalLike({
          id: transaction.id,
          amount_ngn: Math.abs(Number(transaction.amount_ngn || 0)),
          bank_name: metadata.bank_name,
          account_number: metadata.account_number,
          account_name: metadata.account_name,
          status: withdrawalStatusFromTransaction(transaction.status, transaction.metadata),
          rejection_reason: metadata.rejection_reason,
          created_at: transaction.created_at
        });
      });

    return NextResponse.json({ withdrawals });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load withdrawals." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { amount, accountKind: rawAccountKind } = (await request.json().catch(() => ({}))) as {
      amount?: number;
      accountKind?: string;
    };
    const accountKind = normalizeAccountKind(rawAccountKind);
    const amountNgn = Math.round(Number(amount || 0));

    if (!Number.isFinite(amountNgn) || amountNgn < MIN_WITHDRAWAL_NGN) {
      return NextResponse.json({ error: `Minimum withdrawal is NGN ${MIN_WITHDRAWAL_NGN.toLocaleString("en-NG")}.` }, { status: 400 });
    }
    if (amountNgn > MAX_WITHDRAWAL_NGN) {
      return NextResponse.json({ error: `Maximum withdrawal is NGN ${MAX_WITHDRAWAL_NGN.toLocaleString("en-NG")} per request.` }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before requesting withdrawal." }, { status: 401 });

    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Withdrawals are not configured. Add SUPABASE_SERVICE_ROLE_KEY in production." }, { status: 503 });

    const account = accountKind === "business" ? await loadBusinessAccount(db, user.id) : await loadRiderAccount(db, user.id);
    if (!account.ok) return NextResponse.json({ error: account.error }, { status: account.status });

    const walletType = walletTypeForAccountKind(accountKind);
    const { data: wallet, error: walletError } = await db
      .from("wallets")
      .upsert({ user_id: user.id, wallet_type: walletType }, { onConflict: "user_id,wallet_type" })
      .select("id, balance_ngn, locked_balance_ngn")
      .single<{ id: string; balance_ngn?: number | null; locked_balance_ngn?: number | null }>();
    if (walletError) throw walletError;

    const balance = Number(wallet.balance_ngn || 0);
    if (balance < amountNgn) return NextResponse.json({ error: "Insufficient wallet balance for this withdrawal." }, { status: 400 });

    const { data: recentWithdrawals, error: recentError } = await db
      .from("transactions")
      .select("amount_ngn, status, metadata, created_at")
      .eq("wallet_id", wallet.id)
      .eq("transaction_type", "withdrawal")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (recentError) throw recentError;
    const last24hTotal = (recentWithdrawals || [])
      .filter((transaction) => withdrawalMetadata(transaction.metadata).withdrawal_account_kind === accountKind)
      .filter((transaction) => withdrawalStatusFromTransaction(transaction.status, transaction.metadata) !== "rejected")
      .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount_ngn || 0)), 0);
    if (last24hTotal + amountNgn > MAX_WITHDRAWAL_NGN) {
      return NextResponse.json({ error: "Your 24-hour withdrawal limit is NGN 200,000. The limit resets after 24 hours." }, { status: 400 });
    }

    const requestId = `FFW-${randomUUID()}`;
    const metadata = {
      withdrawal_request_id: requestId,
      withdrawal_account_kind: accountKind,
      withdrawal_status: "pending",
      bank_name: account.bank_name || "Bank pending",
      account_number: account.account_number || "Account pending",
      account_name: account.account_name || account.name,
      rider_profile_id: accountKind === "rider" ? account.profile_id : null,
      business_profile_id: accountKind === "business" ? account.profile_id : null,
      payout_sla_hours: PAYOUT_SLA_HOURS
    };

    const { data: transaction, error: transactionError } = await db
      .from("transactions")
      .insert({
        wallet_id: wallet.id,
        transaction_type: "withdrawal",
        amount_ngn: amountNgn * -1,
        status: "pending",
        provider: "manual_admin_payout",
        provider_reference: requestId,
        metadata
      })
      .select("id, amount_ngn, status, metadata, created_at")
      .single<{ id: string; amount_ngn: number; status: string; metadata?: unknown; created_at: string }>();
    if (transactionError) throw transactionError;

    await Promise.allSettled([
      db
        .from("wallets")
        .update({
          balance_ngn: balance - amountNgn,
          locked_balance_ngn: Number(wallet.locked_balance_ngn || 0) + amountNgn,
          updated_at: new Date().toISOString()
        })
        .eq("id", wallet.id),
      db.from("notifications").insert({
        user_id: user.id,
        title: "Withdrawal requested",
        body: `Your NGN ${amountNgn.toLocaleString("en-NG")} ${accountKind} payout is pending admin review.`,
        type: "withdrawal_requested",
        channel: "in_app",
        metadata: { withdrawal_request_id: requestId, transaction_id: transaction.id, account_kind: accountKind, amount_ngn: amountNgn }
      })
    ]);

    const meta = withdrawalMetadata(transaction.metadata);
    return NextResponse.json({
      withdrawal: formatWithdrawalLike({
        id: transaction.id,
        amount_ngn: amountNgn,
        bank_name: meta.bank_name,
        account_number: meta.account_number,
        account_name: meta.account_name,
        status: "pending",
        created_at: transaction.created_at
      })
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not request withdrawal." }, { status: 500 });
  }
}

function normalizeAccountKind(value: unknown): WalletAccountKind {
  const kind = String(value || "rider");
  return withdrawableKinds.has(kind) ? (kind as WalletAccountKind) : "rider";
}

async function loadRiderAccount(db: ReturnType<typeof createAdminClient>, userId: string) {
  if (!db) return { ok: false as const, status: 503, error: "Withdrawals are not configured." };
  const { data, error } = await db
    .from("rider_profiles")
    .select("id, application_status, bank_name, account_number, account_name, users:users!rider_profiles_user_id_fkey(full_name)")
    .eq("user_id", userId)
    .maybeSingle<{
      id: string;
      application_status?: string | null;
      bank_name?: string | null;
      account_number?: string | null;
      account_name?: string | null;
      users?: { full_name?: string | null } | null;
    }>();
  if (error) throw error;
  if (!data?.id) return { ok: false as const, status: 404, error: "Rider profile not found." };
  if (data.application_status !== "approved") return { ok: false as const, status: 403, error: "Your rider KYC must be approved before withdrawals are enabled." };
  return {
    ok: true as const,
    profile_id: data.id,
    name: data.account_name || data.users?.full_name || "Rider",
    bank_name: data.bank_name,
    account_number: data.account_number,
    account_name: data.account_name
  };
}

async function loadBusinessAccount(db: ReturnType<typeof createAdminClient>, userId: string) {
  if (!db) return { ok: false as const, status: 503, error: "Withdrawals are not configured." };
  const { data, error } = await db
    .from("business_profiles")
    .select("id, business_name, registration_status")
    .eq("user_id", userId)
    .maybeSingle<{ id: string; business_name?: string | null; registration_status?: string | null }>();
  if (error) throw error;
  if (!data?.id) return { ok: false as const, status: 404, error: "Business profile not found." };
  if (data.registration_status !== "active") return { ok: false as const, status: 403, error: "Your business KYC must be approved before withdrawals are enabled." };
  return {
    ok: true as const,
    profile_id: data.id,
    name: data.business_name || "Business",
    bank_name: null,
    account_number: null,
    account_name: data.business_name || null
  };
}
