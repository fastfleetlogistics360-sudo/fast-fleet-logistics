import { NextResponse } from "next/server";
import { parseSelfServiceRole, parseUserRole } from "@/lib/auth/roles";
import { loadHubOverview } from "@/lib/hub-overview";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("user_id", user.id)
      .maybeSingle<{ account_type?: string | null }>();
    if (error) throw error;
    const role = parseUserRole(profile?.account_type) || parseSelfServiceRole(user.user_metadata?.account_type || user.user_metadata?.role);
    if (!role) return NextResponse.json({ error: "Choose an account type to continue." }, { status: 409 });

    return NextResponse.json(await loadHubOverview(supabase, user.id, role), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch {
    return NextResponse.json({ error: "Could not load Hub details." }, { status: 500 });
  }
}
