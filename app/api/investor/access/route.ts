import { NextResponse } from "next/server";
import { loadInvestorProfileForUser } from "@/lib/investors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Confirms that the currently authenticated user can use the investor portal.
 * This is intentionally separate from the user's primary customer/rider/business
 * profile: one Fast Fleets account may also be an approved investor. */
export async function GET() {
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    if (!user.email_confirmed_at) return NextResponse.json({ error: "Verify your email before opening investor access." }, { status: 403 });

    const database = createAdminClient();
    if (!database) return NextResponse.json({ error: "Investor access is temporarily unavailable." }, { status: 503 });
    const investor = await loadInvestorProfileForUser(database, user.id);
    if (!investor) return NextResponse.json({ error: "This Fast Fleets account is not linked to an investor profile." }, { status: 403 });
    if (investor.status === "suspended") return NextResponse.json({ error: "This investor account is suspended. Contact Fast Fleets 360 support." }, { status: 403 });

    return NextResponse.json({ ok: true, onboardingRequired: !investor.onboarding_completed_at });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify investor access." }, { status: 500 });
  }
}
