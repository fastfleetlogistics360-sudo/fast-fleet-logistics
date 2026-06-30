import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeState } from "@/lib/launch-states";
import { extractNigerianState } from "@/lib/location/state-matching";
import { defaultShoppingMalls, mallMenuSettingsKey, normalizeShoppingMalls } from "@/lib/mall-menu";
import { defaultRestaurantKitchens, normalizeRestaurantKitchens, restaurantMenuSettingsKey } from "@/lib/restaurant-menu";

export type MarketplaceCheckoutItem = {
  name?: string;
  store?: string;
  storeAddress?: string;
  pickupAddress?: string;
  mallLocation?: string;
  quantity?: number;
  price?: number;
  subtotal?: number;
  productId?: string;
  productName?: string;
  storeId?: string;
  businessId?: string;
  mallId?: string;
  mallName?: string;
  vendorId?: string;
  vendorName?: string;
  category?: string;
};

export type LinkedBusinessRow = {
  id: string;
  user_id: string;
  business_name?: string | null;
  pickup_address?: string | null;
  operating_state?: string | null;
  registration_status?: string | null;
  users?: { default_zone?: string | null } | null;
};

type MarketplaceKind = "restaurant" | "shopping";
type PlatformSettingRow = { value?: unknown | null };

export async function resolveMarketplaceBusinessLinks(
  db: SupabaseClient,
  kind: MarketplaceKind | undefined,
  items: MarketplaceCheckoutItem[]
) {
  const marketplaceKind: MarketplaceKind = kind === "shopping" ? "shopping" : "restaurant";
  const resolvedItems =
    marketplaceKind === "shopping"
      ? await resolveShoppingBusinessLinks(db, items)
      : await resolveRestaurantBusinessLinks(db, items);
  const linkedBusinessIds = Array.from(new Set(resolvedItems.map((item) => item.businessId).filter((id): id is string => Boolean(id))));

  return {
    marketplaceKind,
    items: resolvedItems,
    linkedBusinessIds,
    hasLinkedItems: linkedBusinessIds.length > 0,
    hasUnlinkedItems: resolvedItems.some((item) => !item.businessId)
  };
}

export async function loadActiveLinkedBusiness(db: SupabaseClient, businessProfileId: string | null | undefined) {
  const id = text(businessProfileId);
  if (!id) return null;

  const linkedBusiness = await db
    .from("business_profiles")
    .select("id, user_id, business_name, pickup_address, operating_state, registration_status, users:users!business_profiles_user_id_fkey(default_zone)")
    .eq("id", id)
    .maybeSingle<LinkedBusinessRow>();

  if (!linkedBusiness.error) {
    return linkedBusiness.data?.registration_status === "active" ? linkedBusiness.data : null;
  }

  const fallback = await db
    .from("business_profiles")
    .select("id, user_id, business_name, pickup_address, registration_status, users:users!business_profiles_user_id_fkey(default_zone)")
    .eq("id", id)
    .maybeSingle<Omit<LinkedBusinessRow, "operating_state">>();
  const data = fallback.data ? { ...fallback.data, operating_state: null } : null;
  return data?.registration_status === "active" ? data : null;
}

export function businessPickupAddressFor(business: LinkedBusinessRow, fallbackAddress: string) {
  const address = business.pickup_address || fallbackAddress;
  const state = normalizeState(business.operating_state || business.users?.default_zone);
  if (!state) return address;
  return extractNigerianState(address) === state ? address : `${address}, ${state}`;
}

async function resolveRestaurantBusinessLinks(db: SupabaseClient, items: MarketplaceCheckoutItem[]) {
  const { data } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", restaurantMenuSettingsKey)
    .maybeSingle<PlatformSettingRow>();
  const kitchens = normalizeRestaurantKitchens(data?.value || defaultRestaurantKitchens);

  return items.map((item) => {
    const kitchen = kitchens.find((entry) => sameId(entry.id, item.storeId))
      || kitchens.find((entry) => sameText(entry.name, item.store))
      || kitchens.find((entry) => sameText(entry.address, item.storeAddress));
    const businessId = text(kitchen?.businessId);
    return businessId ? { ...item, businessId } : withoutBusinessId(item);
  });
}

async function resolveShoppingBusinessLinks(db: SupabaseClient, items: MarketplaceCheckoutItem[]) {
  const { data } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", mallMenuSettingsKey)
    .maybeSingle<PlatformSettingRow>();
  const malls = normalizeShoppingMalls(data?.value || defaultShoppingMalls);

  return items.map((item) => {
    const mallCandidates = malls.filter((mall) =>
      sameId(mall.id, item.mallId)
      || sameText(mall.name, item.mallName)
      || includesText(item.store, mall.name)
      || sameText(mall.location, item.mallLocation)
    );
    const searchMalls = mallCandidates.length ? mallCandidates : malls;
    const vendorId = text(item.vendorId || item.storeId);
    const vendorName = text(item.vendorName || item.store);
    let resolvedBusinessId = "";

    for (const mall of searchMalls) {
      const store = mall.stores.find((entry) => sameId(entry.id, vendorId))
        || mall.stores.find((entry) => sameText(entry.name, vendorName) || includesText(item.store, entry.name));
      if (!store) continue;

      const productName = text(item.productName || item.name);
      const product = store.products.find((entry) => sameId(entry.id, item.productId))
        || store.products.find((entry) => sameText(entry.name, productName));
      resolvedBusinessId = text(product?.businessId || store.businessId);
      break;
    }

    return resolvedBusinessId ? { ...item, businessId: resolvedBusinessId } : withoutBusinessId(item);
  });
}

function withoutBusinessId(item: MarketplaceCheckoutItem): MarketplaceCheckoutItem {
  const next = { ...item };
  delete next.businessId;
  return next;
}

function sameId(first: unknown, second: unknown) {
  const left = text(first);
  const right = text(second);
  return Boolean(left && right && left === right);
}

function sameText(first: unknown, second: unknown) {
  const left = comparable(first);
  const right = comparable(second);
  return Boolean(left && right && left === right);
}

function includesText(haystack: unknown, needle: unknown) {
  const left = comparable(haystack);
  const right = comparable(needle);
  return Boolean(left && right && left.includes(right));
}

function comparable(value: unknown) {
  return text(value).toLowerCase();
}

function text(value: unknown) {
  return String(value || "").trim();
}
