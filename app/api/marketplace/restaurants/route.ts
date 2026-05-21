import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  defaultRestaurantKitchens,
  normalizeRestaurantKitchens,
  restaurantMenuSettingsKey
} from "@/lib/restaurant-menu";

export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ restaurants: defaultRestaurantKitchens, demo: true });
  }

  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", restaurantMenuSettingsKey).maybeSingle();
  if (error) {
    return NextResponse.json({ restaurants: defaultRestaurantKitchens, demo: true });
  }

  return NextResponse.json({ restaurants: normalizeRestaurantKitchens(data?.value || defaultRestaurantKitchens) });
}
