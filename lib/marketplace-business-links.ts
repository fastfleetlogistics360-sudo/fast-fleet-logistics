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
  campusZoneId?: string;
  pickupPlaceId?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupNote?: string;
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

/** Server-side guard for the public status shown on marketplace cards. */
export async function findClosedMarketplaceVendor(
  db: SupabaseClient,
  kind: MarketplaceKind | undefined,
  items: MarketplaceCheckoutItem[]
) {
  if (kind === "shopping") {
    const { data } = await db.from("platform_settings").select("value").eq("key", mallMenuSettingsKey).maybeSingle<PlatformSettingRow>();
    const malls = normalizeShoppingMalls(data?.value || defaultShoppingMalls);
    for (const item of items) {
      const vendor = findShoppingStore(malls, item);
      if (vendor?.store.operatingStatus === "closed") return vendor.store.name;
    }
    return null;
  }

  const { data } = await db.from("platform_settings").select("value").eq("key", restaurantMenuSettingsKey).maybeSingle<PlatformSettingRow>();
  const kitchens = normalizeRestaurantKitchens(data?.value || defaultRestaurantKitchens);
  for (const item of items) {
    const kitchen = kitchens.find((entry) => sameId(entry.id, item.storeId) || sameText(entry.name, item.store));
    if (kitchen?.operatingStatus === "closed") return kitchen.name;
  }
  return null;
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
    const resolved = kitchen
      ? {
          ...item,
          storeAddress: kitchen.address,
          pickupAddress: kitchen.address,
          pickupPlaceId: kitchen.pickupPlaceId,
          pickupLatitude: kitchen.pickupLatitude,
          pickupLongitude: kitchen.pickupLongitude,
          pickupNote: kitchen.pickupNote,
          campusZoneId: kitchen.campusZoneId
        }
      : item;
    return businessId ? { ...resolved, businessId } : withoutBusinessId(resolved);
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
    const vendor = findShoppingStore(malls, item);
    const resolvedStore = vendor?.store || null;
    const resolvedMall = vendor?.mall || null;
    const productName = text(item.productName || item.name);
    // A product ID is authoritative. Only use the legacy name fallback when
    // there is exactly one matching product in this vendor's own catalogue.
    const productMatches = resolvedStore
      ? resolvedStore.products.filter((entry) => sameId(entry.id, item.productId) || (!text(item.productId) && sameText(entry.name, productName)))
      : [];
    const product = productMatches.length === 1 ? productMatches[0] : null;
    const resolvedBusinessId = text(product?.businessId || resolvedStore?.businessId);
    const resolved = resolvedStore
      ? {
          ...item,
          storeAddress: resolvedStore.pickupAddress || resolvedMall?.location || item.storeAddress,
          pickupAddress: resolvedStore.pickupAddress || resolvedMall?.location || item.pickupAddress,
          pickupPlaceId: resolvedStore.pickupPlaceId,
          pickupLatitude: resolvedStore.pickupLatitude,
          pickupLongitude: resolvedStore.pickupLongitude,
          pickupNote: resolvedStore.pickupNote,
          campusZoneId: resolvedStore.campusZoneId
        }
      : item;

    return resolvedBusinessId ? { ...resolved, businessId: resolvedBusinessId } : withoutBusinessId(resolved);
  });
}

function findShoppingStore(malls: ReturnType<typeof normalizeShoppingMalls>, item: MarketplaceCheckoutItem) {
  const vendorId = text(item.vendorId || item.storeId);
  const requestedMallId = text(item.mallId);
  const mallsToSearch = requestedMallId ? malls.filter((mall) => sameId(mall.id, requestedMallId)) : malls;

  // Never fall back to another vendor's name when the client sent an ID. A
  // stale or malformed ID must result in no linked business, not the wrong one.
  if (vendorId) {
    const matches = mallsToSearch.flatMap((mall) => mall.stores.filter((store) => sameId(store.id, vendorId)).map((store) => ({ mall, store })));
    return matches.length === 1 ? matches[0] : null;
  }

  const vendorName = text(item.vendorName || item.store);
  const matches = mallsToSearch.flatMap((mall) =>
    mall.stores.filter((store) => sameText(store.name, vendorName)).map((store) => ({ mall, store }))
  );
  return matches.length === 1 ? matches[0] : null;
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

function comparable(value: unknown) {
  return text(value).toLowerCase();
}

function text(value: unknown) {
  return String(value || "").trim();
}
