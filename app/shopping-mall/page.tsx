import type { Metadata } from "next";
import { MallMarketplace } from "@/components/marketplace/mall-marketplace";
import { loadPublicShoppingMalls } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopping Mall"
};

export default async function ShoppingMallPage() {
  const malls = await loadPublicShoppingMalls();

  return <MallMarketplace initialMalls={malls} />;
}
