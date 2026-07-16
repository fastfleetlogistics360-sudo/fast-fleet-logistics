import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureWallet,
  riderCommissionRate
} from "@/lib/wallet-ledger";

type CommissionResult = {
  accountKind: "business" | "rider";
  accountId: string;
  amount: number;
  earnings: number;
  rate: number;
  status: "deducted" | "skipped";
  reason?: string;
};

export async function GET(request: Request) {
  return runDailyCommission(request);
}

async function runDailyCommission(request: Request) {
  const startedAt = Date.now();
  const timestamp = new Date(startedAt).toISOString();
  const runId = randomUUID();
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) {
    const misconfigured = authorization.reason === "misconfigured";
    return NextResponse.json(
      { error: misconfigured ? "Commission job is not securely configured." : "Commission job authorization required." },
      { status: misconfigured ? 503 : 401 }
    );
  }

  console.info("daily_commission_run", {
    event: "authorized_execution",
    runId,
    timestamp,
    authorized: true
  });

  try {
    const db = createAdminClient();
    if (!db) {
      console.error("daily_commission_run", {
        event: "completed",
        runId,
        timestamp,
        authorized: true,
        riderAccountsProcessed: 0,
        businessAccountsProcessed: 0,
        successCount: 0,
        skippedCount: 0,
        failureCount: 1,
        durationMs: Date.now() - startedAt
      });
      return NextResponse.json({ error: "Commission job is unavailable." }, { status: 503 });
    }

    const runDate = lagosBusinessDate();
    const [businessResults, riderResults] = await Promise.all([
      deductBusinessCommissions(db, runDate),
      deductRiderCommissions(db, runDate)
    ]);
    const results = [...businessResults, ...riderResults];
    const successCount = results.filter((result) => result.status === "deducted").length;
    const skippedCount = results.filter((result) => result.status === "skipped").length;

    console.info("daily_commission_run", {
      event: "completed",
      runId,
      timestamp,
      authorized: true,
      riderAccountsProcessed: riderResults.length,
      businessAccountsProcessed: businessResults.length,
      successCount,
      skippedCount,
      failureCount: 0,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({
      runDate,
      commissionBasis: "new_earnings",
      results
    });
  } catch {
    console.error("daily_commission_run", {
      event: "completed",
      runId,
      timestamp,
      authorized: true,
      riderAccountsProcessed: 0,
      businessAccountsProcessed: 0,
      successCount: 0,
      skippedCount: 0,
      failureCount: 1,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: "Could not run daily commission deductions." }, { status: 500 });
  }
}

function lagosBusinessDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function deductBusinessCommissions(db: NonNullable<ReturnType<typeof createAdminClient>>, runDate: string): Promise<CommissionResult[]> {
  const { data: businesses, error } = await db
    .from("business_profiles")
    .select("id, user_id, business_name, business_type, commission_rate, registration_status")
    .eq("registration_status", "active")
    .limit(500);
  if (error) throw error;

  const results: CommissionResult[] = [];
  for (const business of businesses || []) {
    const rate = Number(business.commission_rate || 0);
    if (!business.user_id || rate <= 0) {
      results.push({ accountKind: "business", accountId: business.id, amount: 0, earnings: 0, rate, status: "skipped", reason: "No commission rate" });
      continue;
    }
    const result = await deductCommission(db, {
      accountKind: "business",
      accountId: business.id,
      userId: business.user_id,
      walletType: "customer",
      rate,
      runDate,
      reference: `commission:business:${business.id}:${runDate}`,
      metadata: {
        account_kind: "business",
        business_profile_id: business.id,
        business_name: business.business_name,
        business_type: business.business_type,
        commission_rate: rate,
        run_date: runDate
      }
    });
    results.push(result);
  }
  return results;
}

async function deductRiderCommissions(db: NonNullable<ReturnType<typeof createAdminClient>>, runDate: string): Promise<CommissionResult[]> {
  const { data: riders, error } = await db
    .from("rider_profiles")
    .select("id, user_id, rider_account_type, application_status")
    .eq("application_status", "approved")
    .limit(1000);
  if (error) throw error;

  const results: CommissionResult[] = [];
  for (const rider of riders || []) {
    if (!rider.user_id) continue;
    const rate = riderCommissionRate(rider.rider_account_type);
    const result = await deductCommission(db, {
      accountKind: "rider",
      accountId: rider.id,
      userId: rider.user_id,
      walletType: "rider",
      rate,
      runDate,
      reference: `commission:rider:${rider.id}:${runDate}`,
      metadata: {
        account_kind: "rider",
        rider_profile_id: rider.id,
        rider_account_type: rider.rider_account_type || "independent",
        commission_rate: rate,
        run_date: runDate
      }
    });
    results.push(result);
  }
  return results;
}

async function deductCommission(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  input: {
    accountKind: "business" | "rider";
    accountId: string;
    userId: string;
    walletType: "customer" | "rider";
    rate: number;
    runDate: string;
    reference: string;
    metadata: Record<string, unknown>;
  }
): Promise<CommissionResult> {
  const wallet = await ensureWallet(db, input.userId, input.walletType);
  const balance = Number(wallet.balance_ngn || 0);
  const earnings = await newEarningsForDate(db, {
    accountKind: input.accountKind,
    walletId: wallet.id,
    runDate: input.runDate
  });

  if (earnings <= 0) {
    return { accountKind: input.accountKind, accountId: input.accountId, amount: 0, earnings, rate: input.rate, status: "skipped", reason: "No new earnings for date" };
  }

  const { data: existing } = await db
    .from("transactions")
    .select("id")
    .eq("provider_reference", input.reference)
    .maybeSingle<{ id: string }>();
  if (existing?.id) {
    return { accountKind: input.accountKind, accountId: input.accountId, amount: 0, earnings, rate: input.rate, status: "skipped", reason: "Already deducted for date" };
  }

  const calculatedAmount = Math.max(0, Math.round((earnings * input.rate) / 100));
  const amount = Math.min(calculatedAmount, Math.max(0, Math.round(balance)));
  if (amount <= 0) {
    return { accountKind: input.accountKind, accountId: input.accountId, amount: 0, earnings, rate: input.rate, status: "skipped", reason: "Calculated commission is zero" };
  }

  const { error: insertError } = await db.from("transactions").insert({
    wallet_id: wallet.id,
    transaction_type: "commission",
    amount_ngn: amount * -1,
    status: "successful",
    provider: "daily_commission",
    provider_reference: input.reference,
    metadata: {
      ...input.metadata,
      earnings_amount_ngn: earnings,
      calculated_commission_ngn: calculatedAmount,
      charged_commission_ngn: amount
    }
  });
  if (insertError) throw insertError;

  await Promise.allSettled([
    db.from("wallets").update({ balance_ngn: balance - amount, updated_at: new Date().toISOString() }).eq("id", wallet.id),
    db.from("notifications").insert({
      user_id: input.userId,
      title: "Daily commission deducted",
      body: `NGN ${amount.toLocaleString("en-NG")} was deducted from your ${input.accountKind} wallet for today's commission.`,
      type: "commission",
      channel: "in_app",
      metadata: { ...input.metadata, amount_ngn: amount, earnings_amount_ngn: earnings }
    })
  ]);

  return { accountKind: input.accountKind, accountId: input.accountId, amount, earnings, rate: input.rate, status: "deducted" };
}

async function newEarningsForDate(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  input: {
    accountKind: "business" | "rider";
    walletId: string;
    runDate: string;
  }
) {
  const { startIso, endIso } = lagosBusinessDayRange(input.runDate);
  let query = db
    .from("transactions")
    .select("amount_ngn, transaction_type, provider, metadata")
    .eq("wallet_id", input.walletId)
    .eq("status", "successful")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .limit(1000);

  if (input.accountKind === "rider") {
    query = query.eq("transaction_type", "rider_earning");
  } else {
    query = query.eq("transaction_type", "wallet_funding").eq("provider", "business_order_checkout");
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || [])
    .filter((transaction) => {
      const metadata = metadataRecord(transaction.metadata);
      if (input.accountKind === "business") return metadata.account_kind === "business";
      return metadata.account_kind === "rider" || transaction.transaction_type === "rider_earning";
    })
    .reduce((sum, transaction) => sum + Math.max(0, Number(transaction.amount_ngn || 0)), 0);
}

function lagosBusinessDayRange(runDate: string) {
  const start = new Date(`${runDate}T00:00:00+01:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
