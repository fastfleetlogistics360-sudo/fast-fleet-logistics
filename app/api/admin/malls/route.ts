import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { defaultShoppingMalls, mallMenuSettingsKey, normalizeShoppingMalls } from "@/lib/mall-menu";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ malls: defaultShoppingMalls, demo: true });
    return NextResponse.json(missingServiceResponse("shopping mall menus"), { status: 503 });
  }

  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", mallMenuSettingsKey).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ malls: normalizeShoppingMalls(data?.value || defaultShoppingMalls) });
}

export async function PUT(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const malls = normalizeShoppingMalls((body as Record<string, unknown>).malls);

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to save shopping mall menus." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .upsert({ key: mallMenuSettingsKey, value: malls as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ malls: normalizeShoppingMalls(data.value) });
}
