import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureLaunchPromoEnrollment } from "@/lib/promos/launch-first-150";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Sign in to enroll in the launch promo." }, { status: 401 });
  }

  const status = await ensureLaunchPromoEnrollment(createAdminClient() || supabase, user.id);
  return NextResponse.json({
    enrolled: Boolean(status?.enrolled),
    enrollmentRank: status?.enrollmentRank ?? null,
    remainingRedemptions: status?.remainingRedemptions ?? 0
  });
}
