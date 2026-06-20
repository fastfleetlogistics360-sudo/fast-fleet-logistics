import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import { defaultHubPromotionSlides, hubPromotionSlidesSettingsKey, normalizeHubPromotionSlides } from "@/lib/hub-promotion-slides";
import type { Json } from "@/lib/supabase/types";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ slides: defaultHubPromotionSlides, demo: true });
    return NextResponse.json(missingServiceResponse("Hub promotions"), { status: 503 });
  }

  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", hubPromotionSlidesSettingsKey).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ slides: normalizeHubPromotionSlides(data?.value || defaultHubPromotionSlides) });
}

export async function PUT(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const slides = normalizeHubPromotionSlides((body as Record<string, unknown>).slides);
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to save Hub promotions." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .upsert({ key: hubPromotionSlidesSettingsKey, value: slides as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ slides: normalizeHubPromotionSlides(data.value) });
}
