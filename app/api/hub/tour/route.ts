import { NextResponse } from "next/server";
import { HUB_TOUR_VERSION } from "@/lib/hub-tour";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    const { error } = await supabase
      .from("profiles")
      .update({ hub_tour_version: HUB_TOUR_VERSION } as Record<string, number>)
      .eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ completed: true, version: HUB_TOUR_VERSION });
  } catch {
    return NextResponse.json({ error: "Could not save Hub tour progress." }, { status: 500 });
  }
}
