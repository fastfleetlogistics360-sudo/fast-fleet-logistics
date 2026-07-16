import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import {
  PAYOUT_SLA_HOURS,
  withdrawalMetadata,
  withdrawalStatusFromTransaction
} from "@/lib/wallet-ledger";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ withdrawals: [], demo: true });
    return NextResponse.json(missingServiceResponse("withdrawals"), { status: 503 });
  }

  const { data, error } = await supabase
    .from("withdrawal_requests")
    .select(
      "id, amount_ngn, bank_name, account_number, account_name, status, rejection_reason, created_at, reviewed_at, rider_profiles:rider_profiles!withdrawal_requests_rider_profile_id_fkey(id, application_status, vehicle_type, operating_zone, users:users!rider_profiles_user_id_fkey(full_name, phone, email))"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const walletWithdrawals = await loadWalletWithdrawals(supabase);
  return NextResponse.json({
    withdrawals: [
      ...(data || []).map((withdrawal) => ({ ...withdrawal, account_kind: "rider", source: "withdrawal_request" })),
      ...walletWithdrawals
    ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 100)
  });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = String(body.status || "");
  const reason = String(body.reason || "");

  if (!id || !["approved", "rejected", "paid"].includes(status)) {
    return NextResponse.json({ error: "Choose a valid withdrawal and action." }, { status: 400 });
  }
  if (status === "rejected" && reason.trim().length < 4) {
    return NextResponse.json({ error: "Add a clear rejection reason for the driver." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to review withdrawals." }, { status: 503 });
  }

  const { data: existingRequest } = await supabase
    .from("withdrawal_requests")
    .select("id, amount_ngn, rider_profiles:rider_profiles!withdrawal_requests_rider_profile_id_fkey(user_id)")
    .eq("id", id)
    .maybeSingle<{ id: string; amount_ngn?: number | null; rider_profiles?: { user_id?: string | null } | null }>();

  if (!existingRequest?.id) {
    return reviewWalletWithdrawal(supabase, id, status, reason.trim());
  }

  const { data, error } = await supabase.rpc("review_withdrawal_request", {
    request_id: id,
    next_status: status,
    rejection_note: status === "rejected" ? reason.trim() : null
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const userId = existingRequest.rider_profiles?.user_id;
  if (userId) {
    await insertNotificationWithPush(supabase, {
      user_id: userId,
      title: status === "approved" ? "Withdrawal approved" : status === "paid" ? "Withdrawal paid" : "Withdrawal rejected",
      body:
        status === "approved"
          ? `Your NGN ${Number(existingRequest.amount_ngn || 0).toLocaleString("en-NG")} rider withdrawal was approved. Bank payout should be credited within ${PAYOUT_SLA_HOURS} business hours.`
          : status === "paid"
            ? `Your NGN ${Number(existingRequest.amount_ngn || 0).toLocaleString("en-NG")} rider withdrawal has been marked as paid.`
            : `Your rider withdrawal was rejected: ${reason.trim()}`,
      type: status === "approved" || status === "paid" ? "withdrawal_approved" : "withdrawal_rejected",
      metadata: { withdrawal_request_id: id, amount_ngn: Number(existingRequest.amount_ngn || 0), status, url: "/rider/dashboard", tag: `ff-withdrawal-${id}` }
    });
  }

  return NextResponse.json({ ok: true, id: data });
}

async function loadWalletWithdrawals(supabase: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("id, wallet_id, amount_ngn, status, metadata, created_at")
    .eq("transaction_type", "withdrawal")
    .eq("provider", "manual_admin_payout")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const eligible = (transactions || []).filter((transaction) => {
    const kind = withdrawalMetadata(transaction.metadata).withdrawal_account_kind;
    return kind === "rider" || kind === "business";
  });
  if (!eligible.length) return [];

  const walletIds = Array.from(new Set(eligible.map((transaction) => transaction.wallet_id).filter(Boolean)));
  const { data: wallets } = walletIds.length
    ? await supabase.from("wallets").select("id, user_id, wallet_type").in("id", walletIds)
    : { data: [] };
  const walletsById = new Map((wallets || []).map((wallet) => [wallet.id, wallet]));

  const userIds = Array.from(new Set((wallets || []).map((wallet) => wallet.user_id).filter(Boolean)));
  const [usersResult, businessResult, riderResult] = await Promise.all([
    userIds.length ? supabase.from("users").select("id, full_name, phone, email").in("id", userIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("business_profiles").select("id, user_id, business_name, registration_status, business_type").in("user_id", userIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("rider_profiles").select("id, user_id, application_status, vehicle_type, operating_zone").in("user_id", userIds) : Promise.resolve({ data: [] })
  ]);
  const usersById = new Map((usersResult.data || []).map((user) => [user.id, user]));
  const businessByUserId = new Map((businessResult.data || []).map((business) => [business.user_id, business]));
  const riderByUserId = new Map((riderResult.data || []).map((rider) => [rider.user_id, rider]));

  return eligible.map((transaction) => {
    const metadata = withdrawalMetadata(transaction.metadata);
    const wallet = walletsById.get(transaction.wallet_id);
    const user = wallet?.user_id ? usersById.get(wallet.user_id) : null;
    const business = wallet?.user_id ? businessByUserId.get(wallet.user_id) : null;
    const rider = wallet?.user_id ? riderByUserId.get(wallet.user_id) : null;
    const accountKind = metadata.withdrawal_account_kind === "business" ? "business" : "rider";
    return {
      id: transaction.id,
      transaction_id: transaction.id,
      source: "wallet_transaction",
      account_kind: accountKind,
      amount_ngn: Math.abs(Number(transaction.amount_ngn || 0)),
      bank_name: metadata.bank_name || "Bank pending",
      account_number: metadata.account_number || "Account pending",
      account_name: metadata.account_name || user?.full_name || business?.business_name || "Name pending",
      status: withdrawalStatusFromTransaction(transaction.status, transaction.metadata),
      rejection_reason: metadata.rejection_reason,
      created_at: transaction.created_at,
      reviewed_at: null,
      rider_profiles:
        accountKind === "rider"
          ? {
              id: rider?.id || null,
              application_status: rider?.application_status || "approved",
              vehicle_type: rider?.vehicle_type || null,
              operating_zone: rider?.operating_zone || null,
              users: user ? { full_name: user.full_name, phone: user.phone, email: user.email } : null
            }
          : null,
      business_profiles:
        accountKind === "business"
          ? {
              id: business?.id || null,
              registration_status: business?.registration_status || "active",
              business_type: business?.business_type || null,
              business_name: business?.business_name || user?.full_name || "Business",
              users: user ? { full_name: user.full_name, phone: user.phone, email: user.email } : null
            }
          : null
    };
  });
}

async function reviewWalletWithdrawal(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string,
  status: string,
  reason: string
) {
  const { data: transaction, error } = await supabase
    .from("transactions")
    .select("id, wallet_id, amount_ngn, status, metadata")
    .eq("id", id)
    .eq("transaction_type", "withdrawal")
    .maybeSingle<{ id: string; wallet_id: string; amount_ngn?: number | null; status?: string | null; metadata?: Record<string, unknown> | null }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!transaction?.id) return NextResponse.json({ error: "Withdrawal request not found." }, { status: 404 });

  const currentStatus = withdrawalStatusFromTransaction(transaction.status, transaction.metadata);
  if (currentStatus === "rejected" || currentStatus === "paid") {
    return NextResponse.json({ error: "This withdrawal request has already been finalized." }, { status: 400 });
  }
  if (status === "paid" && currentStatus !== "approved") {
    return NextResponse.json({ error: "Approve the withdrawal before marking it as paid." }, { status: 400 });
  }
  if (status === "rejected" && reason.length < 4) {
    return NextResponse.json({ error: "Add a clear rejection reason." }, { status: 400 });
  }

  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("id, user_id, balance_ngn, locked_balance_ngn")
    .eq("id", transaction.wallet_id)
    .single<{ id: string; user_id: string; balance_ngn?: number | null; locked_balance_ngn?: number | null }>();
  if (walletError) return NextResponse.json({ error: walletError.message }, { status: 400 });

  const amount = Math.abs(Number(transaction.amount_ngn || 0));
  const withdrawalInfo = withdrawalMetadata(transaction.metadata);
  const notificationUrl = withdrawalInfo.withdrawal_account_kind === "business" ? "/business/dashboard" : "/rider/dashboard";
  const metadata = {
    ...((transaction.metadata || {}) as Record<string, unknown>),
    withdrawal_status: status,
    reviewed_at: new Date().toISOString(),
    payout_sla_hours: PAYOUT_SLA_HOURS,
    ...(status === "rejected" ? { rejection_reason: reason } : {}),
    ...(status === "paid" ? { paid_at: new Date().toISOString() } : {})
  };

  if (status === "approved") {
    await supabase.from("transactions").update({ metadata }).eq("id", transaction.id);
  } else if (status === "paid") {
    await Promise.all([
      supabase.from("transactions").update({ status: "successful", metadata }).eq("id", transaction.id),
      supabase
        .from("wallets")
        .update({ locked_balance_ngn: Math.max(0, Number(wallet.locked_balance_ngn || 0) - amount), updated_at: new Date().toISOString() })
        .eq("id", wallet.id)
    ]);
  } else {
    await Promise.all([
      supabase.from("transactions").update({ status: "failed", metadata }).eq("id", transaction.id),
      supabase
        .from("wallets")
        .update({
          balance_ngn: Number(wallet.balance_ngn || 0) + amount,
          locked_balance_ngn: Math.max(0, Number(wallet.locked_balance_ngn || 0) - amount),
          updated_at: new Date().toISOString()
        })
        .eq("id", wallet.id)
    ]);
  }

  await insertNotificationWithPush(supabase, {
    user_id: wallet.user_id,
    title: status === "approved" ? "Withdrawal approved" : status === "paid" ? "Withdrawal paid" : "Withdrawal rejected",
    body:
      status === "approved"
        ? `Your NGN ${amount.toLocaleString("en-NG")} withdrawal was approved. Bank payout should be credited within ${PAYOUT_SLA_HOURS} business hours.`
        : status === "paid"
          ? `Your NGN ${amount.toLocaleString("en-NG")} withdrawal has been marked as paid.`
          : `Your withdrawal was rejected: ${reason}`,
    type: status === "approved" || status === "paid" ? "withdrawal_approved" : "withdrawal_rejected",
    metadata: { withdrawal_request_id: id, transaction_id: transaction.id, amount_ngn: amount, status, url: notificationUrl, tag: `ff-withdrawal-${transaction.id}` }
  });

  return NextResponse.json({ ok: true, id: transaction.id });
}
