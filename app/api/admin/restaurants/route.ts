import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import { extractNigerianState } from "@/lib/location/state-matching";
import type { Json } from "@/lib/supabase/types";
import {
  defaultRestaurantKitchens,
  normalizeRestaurantKitchens,
  restaurantMenuSettingsKey,
  type RestaurantKitchen
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
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;

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

  const savedRestaurants = normalizeRestaurantKitchens(data.value);
  const marketplaceError = await syncRestaurantMarketplaceBranches(supabase, savedRestaurants);
  if (marketplaceError) {
    return NextResponse.json({
      error: `Restaurant menus were saved, but their pickup branches could not be updated: ${marketplaceError}`
    }, { status: 500 });
  }

  return NextResponse.json({ restaurants: savedRestaurants });
}

/**
 * The menu editor is the source of truth for a restaurant's pickup point.
 * Keep the checkout-only vendor records in step with it, so choosing a
 * business account and a map address never leaves a restaurant unorderable.
 */
async function syncRestaurantMarketplaceBranches(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  restaurants: RestaurantKitchen[]
) {
  const invalidStateKitchen = restaurants.find((kitchen) => !extractNigerianState(kitchen.address));
  if (invalidStateKitchen) {
    return `${invalidStateKitchen.name} needs a pickup address that includes a Nigerian state.`;
  }

  const vendorRows = restaurants.map((kitchen) => ({
    source_kind: "restaurant",
    legacy_menu_id: kitchen.id,
    display_name: kitchen.name,
    marketplace_category: "restaurant",
    linked_business_profile_id: validUuid(kitchen.businessId) ? kitchen.businessId : null
  }));
  const { data: vendors, error: vendorError } = await supabase
    .from("marketplace_vendors")
    .upsert(vendorRows, { onConflict: "source_kind,legacy_menu_id" })
    .select("id, legacy_menu_id");
  if (vendorError) return vendorError.message;

  const vendorIdByMenuId = new Map((vendors || []).map((vendor) => [vendor.legacy_menu_id, vendor.id]));
  const missingVendor = restaurants.find((kitchen) => !vendorIdByMenuId.get(kitchen.id));
  if (missingVendor) return `No marketplace vendor record was returned for ${missingVendor.name}.`;

  const branchRows = restaurants.map((kitchen) => ({
    marketplace_vendor_id: vendorIdByMenuId.get(kitchen.id)!,
    legacy_branch_key: `${kitchen.id}:default`,
    state: extractNigerianState(kitchen.address),
    operational_area: kitchen.area,
    pickup_address: kitchen.address,
    pickup_place_id: kitchen.pickupPlaceId || null,
    pickup_latitude: kitchen.pickupLatitude ?? null,
    pickup_longitude: kitchen.pickupLongitude ?? null,
    pickup_instructions: kitchen.pickupNote || null,
    operational_status: kitchen.operatingStatus === "closed" ? "closed" : "open"
  }));
  const { error: branchError } = await supabase
    .from("marketplace_vendor_branches")
    .upsert(branchRows, { onConflict: "marketplace_vendor_id,legacy_branch_key" });

  return branchError?.message || null;
}

function validUuid(value: string | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
