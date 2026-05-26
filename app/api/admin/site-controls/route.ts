import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import type { Json } from "@/lib/supabase/types";

const settingsKey = "admin_site_controls";

const defaultControls = {
  bookings_enabled: true,
  rider_onboarding_enabled: true,
  wallet_topups_enabled: true,
  withdrawals_enabled: true,
  support_status: "open",
  launch_headline: "Fast Fleets 360 is live in Lagos and Ogun.",
  launch_message: "Customers and riders in new states can join the waitlist while operations expand.",
  wallet_policy: {
    min_topup_ngn: 500,
    min_withdrawal_ngn: 3000,
    max_withdrawal_ngn: 200000,
    payout_sla_hours: 24
  }
};

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ controls: defaultControls, demo: true });
    return NextResponse.json(missingServiceResponse("site controls"), { status: 503 });
  }

  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", settingsKey).maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ controls: { ...defaultControls, ...(data?.value as object | null) } });
}

export async function PUT(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const parsed = parseControls(await request.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to save site controls." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .upsert({ key: settingsKey, value: parsed.controls as Json, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ controls: data.value });
}

function parseControls(body: Record<string, unknown>): { controls: typeof defaultControls } | { error: string } {
  const walletPolicy = (body.wallet_policy || {}) as Record<string, unknown>;
  const supportStatus = String(body.support_status || "open");

  if (!["open", "priority_only", "closed"].includes(supportStatus)) {
    return { error: "Choose a valid support flow status." };
  }

  const controls = {
    bookings_enabled: Boolean(body.bookings_enabled),
    rider_onboarding_enabled: Boolean(body.rider_onboarding_enabled),
    wallet_topups_enabled: Boolean(body.wallet_topups_enabled),
    withdrawals_enabled: Boolean(body.withdrawals_enabled),
    support_status: supportStatus,
    launch_headline: String(body.launch_headline || "").trim().slice(0, 140) || defaultControls.launch_headline,
    launch_message: String(body.launch_message || "").trim().slice(0, 300) || defaultControls.launch_message,
    wallet_policy: {
      min_topup_ngn: clampMoney(walletPolicy.min_topup_ngn, 100, 1000000, defaultControls.wallet_policy.min_topup_ngn),
      min_withdrawal_ngn: clampMoney(walletPolicy.min_withdrawal_ngn, 1000, 1000000, defaultControls.wallet_policy.min_withdrawal_ngn),
      max_withdrawal_ngn: clampMoney(walletPolicy.max_withdrawal_ngn, 1000, 5000000, defaultControls.wallet_policy.max_withdrawal_ngn),
      payout_sla_hours: clampMoney(walletPolicy.payout_sla_hours, 1, 168, defaultControls.wallet_policy.payout_sla_hours)
    }
  };

  if (controls.wallet_policy.max_withdrawal_ngn < controls.wallet_policy.min_withdrawal_ngn) {
    return { error: "Maximum withdrawal must be higher than minimum withdrawal." };
  }

  return { controls };
}

function clampMoney(value: unknown, min: number, max: number, fallback: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  return Math.min(max, Math.max(min, Math.round(amount)));
}
