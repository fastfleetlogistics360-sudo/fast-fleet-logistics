import { NextResponse } from "next/server";
import { checkSquadKey } from "@/lib/payments/squad";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "SQUAD_SECRET_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "FASTFLEET_ADMIN_USERNAME",
  "FASTFLEET_ADMIN_PASSWORD",
  "FASTFLEET_ADMIN_SECRET",
  "FASTFLEET_ADMIN_USER_ID"
] as const;

const criticalTables = [
  "users",
  "profiles",
  "deliveries",
  "delivery_events",
  "delivery_locations",
  "rider_locations",
  "user_locations",
  "rider_profiles",
  "rider_applications",
  "notifications",
  "support_tickets",
  "transactions",
  "withdrawal_requests",
  "platform_settings",
  "platform_launch_states",
  "promo_campaigns",
  "promo_enrollments",
  "promo_redemptions",
  "state_waitlist",
  "rate_limit_buckets",
  "fraud_signals",
  "company_transaction_logs"
];

type Check = {
  name: string;
  ok: boolean;
  message: string;
};

export async function GET() {
  const checks: Check[] = [];

  for (const key of requiredEnv) {
    checks.push({
      name: `env:${key}`,
      ok: Boolean(process.env[key]),
      message: process.env[key] ? "Configured" : "Missing"
    });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  checks.push({
    name: "site_url:production_domain",
    ok: /^https:\/\/(www\.)?fastfleet\.com\.ng\/?$/.test(siteUrl),
    message: siteUrl ? `Current value is ${siteUrl}` : "Missing NEXT_PUBLIC_SITE_URL"
  });

  try {
    getSupabasePublicConfig();
    checks.push({ name: "supabase:public_config", ok: true, message: "Public Supabase config loads" });
  } catch (error) {
    checks.push({ name: "supabase:public_config", ok: false, message: error instanceof Error ? error.message : "Supabase config failed" });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    checks.push({ name: "supabase:admin_client", ok: false, message: "Missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL" });
  } else {
    checks.push({ name: "supabase:admin_client", ok: true, message: "Admin client created" });
    const tableResults = await Promise.all(
      criticalTables.map(async (table) => {
        const { error } = await supabase.from(table).select("*", { head: true, count: "exact" });
        return {
          name: `supabase:table:${table}`,
          ok: !error,
          message: error?.message || "Reachable"
        };
      })
    );
    checks.push(...tableResults);

    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    checks.push({
      name: "supabase:storage:rider-documents",
      ok: !bucketError && Boolean(buckets?.some((bucket) => bucket.name === "rider-documents")),
      message: bucketError?.message || (buckets?.some((bucket) => bucket.name === "rider-documents") ? "Bucket exists" : "Bucket missing")
    });
  }

  checks.push({
    name: "email:confirmation_provider",
    ok: true,
    message: process.env.RESEND_API_KEY
      ? "RESEND_API_KEY exists in Vercel, but Supabase Auth confirmation email still depends on Supabase Auth SMTP settings."
      : "No RESEND_API_KEY is used by this app. If you use Resend for confirmation emails, configure it in Supabase Auth SMTP."
  });

  checks.push(await checkSquad());

  const failed = checks.filter((check) => !check.ok);
  return NextResponse.json(
    {
      ok: failed.length === 0,
      checked_at: new Date().toISOString(),
      failed_count: failed.length,
      checks
    },
    {
      status: failed.length === 0 ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

async function checkSquad(): Promise<Check> {
  try {
    const result = await checkSquadKey();
    return {
      name: "squad:api",
      ok: result.ok,
      message: result.message
    };
  } catch (error) {
    return {
      name: "squad:api",
      ok: false,
      message: error instanceof Error ? error.message : "Squad check failed"
    };
  }
}
