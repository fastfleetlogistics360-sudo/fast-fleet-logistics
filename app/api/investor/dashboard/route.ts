import { NextResponse } from "next/server";
import { loadInvestorDashboard } from "@/lib/investor-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    if (!user.email_confirmed_at) return NextResponse.json({ error: "Verify your email before opening the investor dashboard." }, { status: 403 });
    const database = createAdminClient();
    if (!database) return NextResponse.json({ error: "Investor dashboard is temporarily unavailable." }, { status: 503 });
    const dashboard = await loadInvestorDashboard(database, user.id);
    if (!dashboard) return NextResponse.json({ error: "Investor account not found." }, { status: 404 });
    if (dashboard.investor.status === "suspended") return NextResponse.json({ error: "This investor account is suspended. Contact Fast Fleets 360 support." }, { status: 403 });
    if (!dashboard.investor.onboardingCompleted) return NextResponse.json({ onboardingRequired: true }, { status: 403 });
    return NextResponse.json(dashboard);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the investor dashboard." }, { status: 500 });
  }
}
