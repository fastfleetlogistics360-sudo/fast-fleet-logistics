import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import {
  defaultRestaurantKitchens,
  normalizeRestaurantKitchens,
  restaurantMenuSettingsKey
} from "@/lib/restaurant-menu";

export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ restaurants: defaultRestaurantKitchens, demo: true });
    return NextResponse.json(missingServiceResponse("restaurant marketplace"), { status: 503 });
  }

  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", restaurantMenuSettingsKey).maybeSingle();
  if (error) {
    if (canUseDemoFallback()) return NextResponse.json({ restaurants: defaultRestaurantKitchens, demo: true });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ restaurants: normalizeRestaurantKitchens(data?.value || defaultRestaurantKitchens) });
}
