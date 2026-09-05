import { NextResponse } from "next/server";
import { loadInvestorProfileForUser, safeText } from "@/lib/investors";
import { encryptInvestorAccountNumber, maskAccountNumber } from "@/lib/investor-payout-accounts";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const database = createAdminClient();
    if (!database) return NextResponse.json({ error: "Investor onboarding is temporarily unavailable." }, { status: 503 });
    const investor = await loadInvestorProfileForUser(database, user.id);
    if (!investor) return NextResponse.json({ error: "Investor account not found." }, { status: 404 });
    if (investor.status === "invited" && user.email_confirmed_at) {
      await database.from("investor_profiles").update({ status: "onboarding" }).eq("id", investor.id);
      investor.status = "onboarding";
    }
    const { data: profile } = await database.from("profiles").select("full_name, email").eq("user_id", user.id).maybeSingle<{ full_name?: string | null; email?: string | null }>();
    const { data: payout } = await database
      .from("investor_payout_accounts")
      .select("bank_name, account_name, account_last4, verification_status")
      .eq("investor_profile_id", investor.id)
      .eq("is_active", true)
      .maybeSingle<{ bank_name?: string | null; account_name?: string | null; account_last4?: string | null; verification_status?: string | null }>();
    return NextResponse.json({
      investor: { code: investor.investor_code, status: investor.status, onboardingCompleted: Boolean(investor.onboarding_completed_at) },
      profile: { fullName: profile?.full_name || "", email: user.email || profile?.email || "", emailVerified: Boolean(user.email_confirmed_at), requiresPasswordSetup: investor.requires_password_setup !== false },
      payout: payout ? { bankName: payout.bank_name, accountName: payout.account_name, accountNumber: maskAccountNumber(payout.account_last4), verificationStatus: payout.verification_status } : null
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load investor onboarding." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    if (!user.email_confirmed_at) return NextResponse.json({ error: "Verify your email before adding payout details." }, { status: 403 });
    const limited = await enforceRateLimit(request, rateLimitPolicies.authSensitive);
    if (limited) return limited;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fullName = safeText(body.fullName, 120);
    const bankName = safeText(body.bankName, 120);
    const accountName = safeText(body.accountName, 120);
    const accountNumber = safeText(body.accountNumber, 20);
    if (fullName.length < 2 || !bankName || accountName.length < 2 || !/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({ error: "Enter your name, bank, account owner name, and valid 10-digit account number." }, { status: 400 });
    }
    const database = createAdminClient();
    if (!database) return NextResponse.json({ error: "Investor onboarding is temporarily unavailable." }, { status: 503 });
    const investor = await loadInvestorProfileForUser(database, user.id);
    if (!investor) return NextResponse.json({ error: "Investor account not found." }, { status: 404 });
    if (investor.status === "suspended") return NextResponse.json({ error: "This investor account is suspended. Contact Fast Fleets 360 support." }, { status: 403 });

    const now = new Date().toISOString();
    const active = await database
      .from("investor_payout_accounts")
      .select("id")
      .eq("investor_profile_id", investor.id)
      .eq("is_active", true)
      .maybeSingle<{ id: string }>();
    if (active.error) throw active.error;
    if (active.data?.id) {
      const { error } = await database.from("investor_payout_accounts").update({ is_active: false, verification_status: "replaced" }).eq("id", active.data.id);
      if (error) throw error;
    }
    const payout = await database.from("investor_payout_accounts").insert({
      investor_profile_id: investor.id,
      bank_name: bankName,
      // Retained for compatibility with the existing database schema. Investor
      // payouts are reviewed manually; no payment-provider bank code is used.
      bank_code: "manual",
      account_number_ciphertext: encryptInvestorAccountNumber(accountNumber),
      account_last4: accountNumber.slice(-4),
      account_name: accountName,
      verification_status: "verified",
      verified_at: now,
      is_active: true
    });
    if (payout.error) {
      if (active.data?.id) await database.from("investor_payout_accounts").update({ is_active: true, verification_status: "verified" }).eq("id", active.data.id);
      throw payout.error;
    }
    const updates = await Promise.all([
      database.from("users").update({ full_name: fullName, updated_at: now }).eq("id", user.id),
      database.from("profiles").update({ full_name: fullName, updated_at: now }).eq("user_id", user.id),
      database.from("investor_profiles").update({ status: "active", onboarding_completed_at: now }).eq("id", investor.id),
      database.from("investor_audit_events").insert({ investor_profile_id: investor.id, actor_user_id: user.id, event_type: "onboarding_completed", metadata: {} })
    ]);
    if (updates.some((result) => result.error)) throw new Error("Could not complete investor onboarding.");
    return NextResponse.json({ ok: true, accountName });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not complete investor onboarding." }, { status: 500 });
  }
}
