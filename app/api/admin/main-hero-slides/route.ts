import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import { defaultMainHeroSlides, mainHeroSlidesSettingsKey, normalizeMainHeroSlides } from "@/lib/main-hero-slides";
import type { Json } from "@/lib/supabase/types";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ slides: defaultMainHeroSlides, demo: true });
    return NextResponse.json(missingServiceResponse("main hero slides"), { status: 503 });
  }

  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", mainHeroSlidesSettingsKey).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ slides: normalizeMainHeroSlides(data?.value || defaultMainHeroSlides) });
}

export async function PUT(request: Request) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const slides = normalizeMainHeroSlides((body as Record<string, unknown>).slides);

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to save main hero slides." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .upsert({ key: mainHeroSlidesSettingsKey, value: slides as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ slides: normalizeMainHeroSlides(data.value) });
}
