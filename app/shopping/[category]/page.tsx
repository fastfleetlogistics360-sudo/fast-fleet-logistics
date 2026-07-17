import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoppingCategoryMarketplace } from "@/components/marketplace/shopping-marketplace";
import { categoryFromShoppingSlug, findShoppingCategoryGroup, shoppingCategoryLabel } from "@/lib/mall-menu";
import { loadPublicShoppingMalls } from "@/lib/public-content";

type ShoppingCategoryPageProps = {
  params: Promise<{ category: string }>;
};

export const revalidate = 300;

export async function generateMetadata({ params }: ShoppingCategoryPageProps): Promise<Metadata> {
  const { category: categorySlug } = await params;
  const category = categoryFromShoppingSlug(categorySlug);
  const label = category ? shoppingCategoryLabel(category) : "Shopping";

  return {
    title: `${label} Vendors | Fast Fleets 360`,
    description: `Shop ${label.toLowerCase()} vendors on Fast Fleets 360 with Squad checkout and delivery estimates.`,
    alternates: {
      canonical: `/shopping/${categorySlug}`
    }
  };
}

export default async function ShoppingCategoryPage({ params }: ShoppingCategoryPageProps) {
  const { category: categorySlug } = await params;
  const category = categoryFromShoppingSlug(categorySlug);
  if (!category) notFound();

  const malls = await loadPublicShoppingMalls();
  const group = findShoppingCategoryGroup(malls, category);
  if (!group) notFound();

  return <ShoppingCategoryMarketplace initialMalls={malls} category={category} />;
}
