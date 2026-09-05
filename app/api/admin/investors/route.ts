import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createInvestorCode, safeText, uniqueIds } from "@/lib/investors";
import { createAdminClient } from "@/lib/supabase/admin";

type InvestorRow = {
  id: string;
  user_id: string;
  investor_code: string;
  status: string;
  onboarding_completed_at?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  created_at?: string | null;
  users?: { full_name?: string | null; email?: string | null } | null;
  investor_asset_assignments?: Array<{
    id: string;
    fleet_asset_id: string;
    assigned_at: string;
    ended_at?: string | null;
    fleet_assets?: { asset_code?: string | null; status?: string | null } | null;
  }>;
};

const investorSelect = "id, user_id, investor_code, status, onboarding_completed_at, suspended_at, suspension_reason, created_at, users:users!investor_profiles_user_id_fkey(full_name, email), investor_asset_assignments(id, fleet_asset_id, assigned_at, ended_at, fleet_assets(asset_code, status))";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const database = createAdminClient();
  if (!database) return NextResponse.json({ error: "Investor management is unavailable until the server database key is configured." }, { status: 503 });
  const { data, error } = await database.from("investor_profiles").select(investorSelect).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ investors: data || [] });
}

export async function POST(request: Request) {
  const adminContext = await requireAdminSession(request);
  if (!adminContext) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request, "destructive");
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = safeText(body.email, 254).toLowerCase();
  const fullName = safeText(body.fullName, 120);
  const assetIds = uniqueIds(body.assetIds);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid investor email address." }, { status: 400 });
  if (fullName.length < 2) return NextResponse.json({ error: "Enter the investor's full name." }, { status: 400 });

  const database = createAdminClient();
  if (!database) return NextResponse.json({ error: "Investor management is unavailable until the server database key is configured." }, { status: 503 });
  const { data: existing } = await database.from("users").select("id, role").eq("email", email).limit(1).maybeSingle<{ id: string; role?: string | null }>();
  if (existing?.id) return NextResponse.json({ error: existing.role === "investor" ? "This investor account already exists." : "This email already belongs to another Fast Fleets 360 account." }, { status: 409 });

  const validation = assetIds.length
    ? await database.from("fleet_assets").select("id, asset_type").in("id", assetIds)
    : { data: [], error: null };
  if (validation.error || (validation.data || []).length !== assetIds.length || validation.data?.some((asset) => asset.asset_type !== "bicycle")) {
    return NextResponse.json({ error: "Choose valid existing bicycle assets." }, { status: 400 });
  }

  const redirectTo = new URL("/investor/activate", request.url).toString();
  const invitation = await database.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: fullName, provisioned_account: "investor" } });
  if (invitation.error || !invitation.data.user) return NextResponse.json({ error: invitation.error?.message || "Could not send the investor invitation." }, { status: 400 });

  const userId = invitation.data.user.id;
  const now = new Date().toISOString();
  const profile = await createInvestorProfile(database, { userId, email, fullName, actorUserId: adminContext.userId, now });
  if (!profile) {
    await database.auth.admin.updateUserById(userId, { ban_duration: "876000h" }).catch(() => null);
    return NextResponse.json({ error: "The invitation was created but the investor profile could not be secured. The account was suspended; contact support before retrying." }, { status: 500 });
  }

  try {
    for (const assetId of assetIds) {
      const { error } = await database.rpc("assign_investor_asset", {
        target_investor_profile_id: profile.id,
        target_fleet_asset_id: assetId,
        actor_user_id: adminContext.userId,
        reason: "Initial investor assignment"
      });
      if (error) throw error;
    }
    await database.from("investor_audit_events").insert([
      { investor_profile_id: profile.id, actor_user_id: adminContext.userId, event_type: "investor_created", metadata: { investor_code: profile.investor_code } },
      { investor_profile_id: profile.id, actor_user_id: adminContext.userId, event_type: "invitation_sent", metadata: {} }
    ]);
  } catch (error) {
    await database.from("investor_profiles").update({ status: "suspended", suspended_at: now, suspension_reason: "Provisioning requires review" }).eq("id", profile.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Investor creation needs review before activation." }, { status: 400 });
  }

  const { data } = await database.from("investor_profiles").select(investorSelect).eq("id", profile.id).single<InvestorRow>();
  return NextResponse.json({ investor: data, invitationSent: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const adminContext = await requireAdminSession(request);
  if (!adminContext) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request, "destructive");
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const investorId = safeText(body.investorId, 80);
  const action = safeText(body.action, 40);
  if (!investorId) return NextResponse.json({ error: "Choose an investor." }, { status: 400 });

  const database = createAdminClient();
  if (!database) return NextResponse.json({ error: "Investor management is unavailable until the server database key is configured." }, { status: 503 });
  const { data: investor, error: investorError } = await database.from("investor_profiles").select("id, user_id, investor_code, status").eq("id", investorId).maybeSingle<{ id: string; user_id: string; investor_code: string; status: string }>();
  if (investorError || !investor) return NextResponse.json({ error: "Investor account not found." }, { status: 404 });

  if (action === "assign") {
    const assetIds = uniqueIds(body.assetIds);
    if (!assetIds.length) return NextResponse.json({ error: "Choose at least one bicycle asset." }, { status: 400 });
    for (const assetId of assetIds) {
      const { error } = await database.rpc("assign_investor_asset", { target_investor_profile_id: investor.id, target_fleet_asset_id: assetId, actor_user_id: adminContext.userId, reason: "Investor asset assignment" });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else if (action === "transfer") {
    const assetId = safeText(body.assetId, 80);
    const nextInvestorId = safeText(body.nextInvestorId, 80);
    const reason = safeText(body.reason, 500);
    if (!assetId || !nextInvestorId || reason.length < 4) return NextResponse.json({ error: "Choose a bicycle, new investor, and clear transfer reason." }, { status: 400 });
    const { error } = await database.rpc("transfer_investor_asset", { target_fleet_asset_id: assetId, next_investor_profile_id: nextInvestorId, actor_user_id: adminContext.userId, reason });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "suspend" || action === "reactivate") {
    const suspended = action === "suspend";
    const reason = safeText(body.reason, 500);
    const { error } = await database
      .from("investor_profiles")
      .update({ status: suspended ? "suspended" : "active", suspended_at: suspended ? new Date().toISOString() : null, suspension_reason: suspended ? reason || "Suspended by administrator" : null })
      .eq("id", investor.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await database.from("investor_audit_events").insert({ investor_profile_id: investor.id, actor_user_id: adminContext.userId, event_type: suspended ? "investor_suspended" : "investor_reactivated", metadata: suspended ? { reason } : {} });
  } else if (action === "resend-invitation" || action === "reset-credentials") {
    const { data: user } = await database.from("users").select("email").eq("id", investor.user_id).maybeSingle<{ email?: string | null }>();
    if (!user?.email) return NextResponse.json({ error: "This investor has no email address." }, { status: 400 });
    const reset = await database.auth.resetPasswordForEmail(user.email, { redirectTo: new URL("/investor/activate", request.url).toString() });
    if (reset.error) return NextResponse.json({ error: reset.error.message }, { status: 400 });
    await database.from("investor_audit_events").insert({ investor_profile_id: investor.id, actor_user_id: adminContext.userId, event_type: action === "resend-invitation" ? "invitation_resent" : "credentials_reset_requested", metadata: {} });
  } else {
    return NextResponse.json({ error: "Choose a valid investor action." }, { status: 400 });
  }

  const { data } = await database.from("investor_profiles").select(investorSelect).eq("id", investor.id).single<InvestorRow>();
  return NextResponse.json({ investor: data });
}

async function createInvestorProfile(database: NonNullable<ReturnType<typeof createAdminClient>>, input: { userId: string; email: string; fullName: string; actorUserId: string; now: string }) {
  const writes = await Promise.all([
    database.from("users").upsert({ id: input.userId, email: input.email, full_name: input.fullName, role: "investor", updated_at: input.now }),
    database.from("profiles").upsert({ id: input.userId, user_id: input.userId, email: input.email, full_name: input.fullName, account_type: "investor", updated_at: input.now })
  ]);
  if (writes.some((result) => result.error)) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const investorCode = createInvestorCode();
    const profile = await database
      .from("investor_profiles")
      .insert({ user_id: input.userId, investor_code: investorCode, status: "invited", created_by: input.actorUserId })
      .select("id")
      .single<{ id: string }>();
    if (profile.data?.id && !profile.error) return { id: profile.data.id, investor_code: investorCode };
    const profileError = profile.error;
    if (!profileError || profileError.code !== "23505") return null;
  }
  return null;
}
