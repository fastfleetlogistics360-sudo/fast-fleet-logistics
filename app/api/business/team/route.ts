import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

const roles = new Set(["dispatcher", "viewer"]);

export async function GET() {
  try {
    const { supabase, businessProfileId, error, status } = await businessContext();
    if (error) return NextResponse.json({ error }, { status });

    const { data, error: queryError } = await supabase
      .from("business_team_members")
      .select("id, email, role, status, created_at")
      .eq("business_profile_id", businessProfileId)
      .order("created_at", { ascending: false });

    if (queryError) throw queryError;
    return NextResponse.json({ members: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load team members." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "viewer").trim();
    if (!email.includes("@") || !roles.has(role)) {
      return NextResponse.json({ error: "Enter a valid email and role." }, { status: 400 });
    }

    const { supabase, userId, businessProfileId, error, status } = await businessContext();
    if (error) return NextResponse.json({ error }, { status });
    const limited = await enforceRateLimit(request, rateLimitPolicies.businessTeamMutation);
    if (limited) return limited;

    const { data, error: insertError } = await supabase
      .from("business_team_members")
      .upsert(
        {
          business_profile_id: businessProfileId,
          invited_by: userId,
          email,
          role,
          status: "invited"
        },
        { onConflict: "business_profile_id,email" }
      )
      .select("id, email, role, status, created_at")
      .single();
    if (insertError) throw insertError;

    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Team invite saved",
      body: `${email} was invited as ${role}.`,
      type: "team_invite",
      channel: "in_app",
      metadata: { email, role }
    });

    return NextResponse.json({ member: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not invite team member." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Choose a team member to remove." }, { status: 400 });

    const { supabase, businessProfileId, error, status } = await businessContext();
    if (error) return NextResponse.json({ error }, { status });
    const limited = await enforceRateLimit(request, rateLimitPolicies.businessTeamMutation);
    if (limited) return limited;

    const { error: deleteError } = await supabase
      .from("business_team_members")
      .delete()
      .eq("id", id)
      .eq("business_profile_id", businessProfileId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove team member." }, { status: 500 });
  }
}

async function businessContext() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Please sign in.", status: 401, userId: "", businessProfileId: "" };

  const { data: businessProfile, error } = await supabase
    .from("business_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { supabase, error: error.message, status: 400, userId: user.id, businessProfileId: "" };
  if (!businessProfile?.id) return { supabase, error: "Create a business profile before managing team members.", status: 400, userId: user.id, businessProfileId: "" };

  return { supabase, error: "", status: 200, userId: user.id, businessProfileId: businessProfile.id as string };
}
