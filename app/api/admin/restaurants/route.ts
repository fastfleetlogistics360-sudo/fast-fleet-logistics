import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import type { Json } from "@/lib/supabase/types";
import {
  defaultRestaurantKitchens,
  normalizeRestaurantKitchens,
  restaurantMenuSettingsKey
} from "@/lib/restaurant-menu";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ restaurants: defaultRestaurantKitchens, demo: true });
    return NextResponse.json(missingServiceResponse("restaurant menus"), { status: 503 });
  }

  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", restaurantMenuSettingsKey).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ restaurants: normalizeRestaurantKitchens(data?.value || defaultRestaurantKitchens) });
}

export async function PUT(request: Request) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const restaurants = normalizeRestaurantKitchens((body as Record<string, unknown>).restaurants);

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to save restaurant menus." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .upsert({ key: restaurantMenuSettingsKey, value: restaurants as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ restaurants: normalizeRestaurantKitchens(data.value) });
}
