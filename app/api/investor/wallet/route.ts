import { NextResponse } from "next/server";
import { loadInvestorWallet } from "@/lib/investor-wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user?.email_confirmed_at) return NextResponse.json({ error: "Verify your email before viewing your investor wallet." }, { status: 403 });
    const database = createAdminClient();
    if (!database) return NextResponse.json({ error: "Investor wallet is temporarily unavailable." }, { status: 503 });
    const wallet = await loadInvestorWallet(database, user.id);
    if (!wallet) return NextResponse.json({ error: "Investor account not found." }, { status: 404 });
    if (wallet.investor.status === "suspended" || !wallet.investor.onboardingCompleted) return NextResponse.json({ error: "Complete investor activation before using the wallet." }, { status: 403 });
    return NextResponse.json(wallet);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load your investor wallet." }, { status: 500 });
  }
}
