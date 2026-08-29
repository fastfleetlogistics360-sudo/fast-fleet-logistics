import { createAdminClient } from "@/lib/supabase/admin";

export const fastErrandsFulfilmentBusinessSettingsKey = "fast_errands_fulfilment_business_id";

export type FastErrandsCategory = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  sort_order: number;
  is_active: boolean;
  items: FastErrandsCatalogItem[];
};

export type FastErrandsCatalogItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_ngn: number;
  sort_order: number;
  is_active: boolean;
};

export async function loadFastErrandsCatalog(includeInactive = false): Promise<FastErrandsCategory[]> {
  const db = createAdminClient();
  if (!db) return [];
  const categoriesQuery = db.from("fast_errand_categories").select("id, name, description, emoji, sort_order, is_active").order("sort_order").order("name");
  const itemsQuery = db.from("fast_errand_catalog_items").select("id, category_id, name, description, price_ngn, sort_order, is_active").order("sort_order").order("name");
  if (!includeInactive) {
    categoriesQuery.eq("is_active", true);
    itemsQuery.eq("is_active", true);
  }
  const [{ data: categories }, { data: items }] = await Promise.all([categoriesQuery, itemsQuery]);
  return ((categories || []) as Omit<FastErrandsCategory, "items">[]).map((category) => ({
    ...category,
    items: ((items || []) as FastErrandsCatalogItem[]).filter((item) => item.category_id === category.id)
  }));
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
