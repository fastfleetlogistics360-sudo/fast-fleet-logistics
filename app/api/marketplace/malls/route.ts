import { NextResponse } from "next/server";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultShoppingMalls, mallMenuSettingsKey, normalizeShoppingMalls } from "@/lib/mall-menu";

export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ malls: defaultShoppingMalls, demo: true });
    return NextResponse.json(missingServiceResponse("shopping marketplace"), { status: 503 });
  }

  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", mallMenuSettingsKey).maybeSingle();
  if (error) {
    if (canUseDemoFallback()) return NextResponse.json({ malls: defaultShoppingMalls, demo: true });
    return NextResponse.json({ error: "Shopping listings are temporarily unavailable. Please try again." }, { status: 503 });
  }

  return NextResponse.json({ malls: normalizeShoppingMalls(data?.value || defaultShoppingMalls) });
}
