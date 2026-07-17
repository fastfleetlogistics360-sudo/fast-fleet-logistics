import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoppingVendorMarketplace } from "@/components/marketplace/shopping-marketplace";
import { findShoppingVendor, shoppingVendorAdvertPath } from "@/lib/mall-menu";
import { loadPublicShoppingMalls } from "@/lib/public-content";

type ShoppingStorePageProps = {
  params: Promise<{ vendorId: string }>;
};

export const revalidate = 300;

export async function generateMetadata({ params }: ShoppingStorePageProps): Promise<Metadata> {
  const { vendorId } = await params;
  const malls = await loadPublicShoppingMalls();
  const vendor = findShoppingVendor(malls, vendorId);

  return {
    title: `${vendor?.store.name || "Shopping Vendor"} | Fast Fleets 360`,
    description: vendor
      ? `Order directly from ${vendor.store.name} on Fast Fleets 360.`
      : "Open a Fast Fleets 360 shopping vendor storefront.",
    alternates: {
      canonical: shoppingVendorAdvertPath({ id: vendorId })
    }
  };
}

export default async function ShoppingStorePage({ params }: ShoppingStorePageProps) {
  const { vendorId } = await params;
  const malls = await loadPublicShoppingMalls();
  const vendor = findShoppingVendor(malls, vendorId);
  if (!vendor) notFound();

  return <ShoppingVendorMarketplace initialMalls={malls} category={vendor.store.category} vendorId={vendor.store.id} />;
}
