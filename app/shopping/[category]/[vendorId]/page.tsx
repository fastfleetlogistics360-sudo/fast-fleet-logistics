import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoppingVendorMarketplace } from "@/components/marketplace/shopping-marketplace";
import { categoryFromShoppingSlug, findShoppingVendor, shoppingCategoryLabel } from "@/lib/mall-menu";
import { loadPublicShoppingMalls } from "@/lib/public-content";

type ShoppingVendorPageProps = {
  params: Promise<{ category: string; vendorId: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ShoppingVendorPageProps): Promise<Metadata> {
  const { category: categorySlug, vendorId } = await params;
  const category = categoryFromShoppingSlug(categorySlug);
  const malls = await loadPublicShoppingMalls();
  const vendor = category ? findShoppingVendor(malls, vendorId, category) : null;
  const label = vendor ? vendor.store.name : category ? shoppingCategoryLabel(category) : "Shopping vendor";

  return {
    title: `${label} | Fast Fleets 360 Shopping`,
    description: vendor
      ? `Order directly from ${vendor.store.name} on Fast Fleets 360.`
      : "Open a Fast Fleets 360 shopping vendor storefront.",
    alternates: {
      canonical: `/shopping/${categorySlug}/${vendorId}`
    }
  };
}

export default async function ShoppingVendorPage({ params }: ShoppingVendorPageProps) {
  const { category: categorySlug, vendorId } = await params;
  const category = categoryFromShoppingSlug(categorySlug);
  if (!category) notFound();

  const malls = await loadPublicShoppingMalls();
  const vendor = findShoppingVendor(malls, vendorId, category);
  if (!vendor) notFound();

  return <ShoppingVendorMarketplace initialMalls={malls} category={category} vendorId={vendor.store.id} />;
}
