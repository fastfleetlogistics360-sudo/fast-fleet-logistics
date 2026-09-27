import { createAdminClient } from "@/lib/supabase/admin";

export const fastErrandsFulfilmentBusinessSettingsKey = "fast_errands_fulfilment_business_id";
export const fastErrandsControlsSettingsKey = "fast_errands_controls";

export type FastErrandsControls = {
  enabled: boolean;
  customerNotice: string | null;
  /** New installs stay on the compatibility path until explicitly activated. */
  mode: "legacy" | "neighborhood";
};

export type FastErrandsCategory = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  sort_order: number;
  is_active: boolean;
  /** Category-level restriction. Item-level restrictions can make access_minimum_age stricter. */
  minimum_age: number | null;
  /** Effective gate for this collection, derived server-side. */
  access_minimum_age: number | null;
  items: FastErrandsCatalogItem[];
};

export type FastErrandsCatalogItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_ngn: number;
  image_url: string | null;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  minimum_age: number | null;
};

export async function loadFastErrandsCatalog(includeInactive = false, includeRestrictedItems = false): Promise<FastErrandsCategory[]> {
  const db = createAdminClient();
  if (!db) return [];
  const categoriesQuery = db.from("fast_errand_categories").select("id, name, description, emoji, sort_order, is_active, minimum_age").order("sort_order").order("name");
  const itemsQuery = db.from("fast_errand_catalog_items").select("id, category_id, name, description, price_ngn, image_url, image_path, sort_order, is_active, minimum_age").order("sort_order").order("name");
  if (!includeInactive) {
    categoriesQuery.eq("is_active", true);
    itemsQuery.eq("is_active", true);
  }
  const [{ data: categories }, { data: items }] = await Promise.all([categoriesQuery, itemsQuery]);
  return ((categories || []) as Array<Omit<FastErrandsCategory, "items" | "access_minimum_age">>).map((category) => {
    const categoryItems = ((items || []) as FastErrandsCatalogItem[]).filter((item) => item.category_id === category.id);
    const access_minimum_age = effectiveMinimumAge(category.minimum_age, ...categoryItems.filter((item) => item.is_active).map((item) => item.minimum_age));
    return { ...category, access_minimum_age, items: includeRestrictedItems || !access_minimum_age ? categoryItems : [] };
  });
}

function effectiveMinimumAge(...values: unknown[]) {
  const ages = values.map((value) => Math.round(Number(value))).filter((value) => Number.isInteger(value) && value >= 18 && value <= 100);
  return ages.length ? Math.max(...ages) : null;
}

export async function loadFastErrandsFulfilmentBusinessId() {
  const db = createAdminClient();
  if (!db) return null;
  const { data } = await db.from("platform_settings").select("value").eq("key", fastErrandsFulfilmentBusinessSettingsKey).maybeSingle();
  const value = data?.value;
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as { businessId?: unknown }).businessId === "string") return (value as { businessId: string }).businessId.trim() || null;
  return null;
}

export async function loadFastErrandsControls(): Promise<FastErrandsControls> {
  const db = createAdminClient();
  if (!db) return { enabled: true, customerNotice: null, mode: "legacy" };
  const { data } = await db.from("platform_settings").select("value").eq("key", fastErrandsControlsSettingsKey).maybeSingle();
  const value = data?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: true, customerNotice: null, mode: "legacy" };
  const controls = value as { enabled?: unknown; customerNotice?: unknown; mode?: unknown };
  return {
    enabled: controls.enabled !== false,
    customerNotice: typeof controls.customerNotice === "string" ? controls.customerNotice.trim().slice(0, 280) || null : null,
    mode: controls.mode === "neighborhood" ? "neighborhood" : "legacy"
  };
}
