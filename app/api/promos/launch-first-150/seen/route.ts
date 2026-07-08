import { NextResponse } from "next/server";
import { markLaunchPromoAnnouncementSeen } from "@/lib/promos/launch-first-150";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const admin = createAdminClient();
  const saved = await markLaunchPromoAnnouncementSeen(admin || supabase, user.id);
  return NextResponse.json({ ok: saved });
}
