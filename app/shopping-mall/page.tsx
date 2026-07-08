import type { Metadata } from "next";
import { MallMarketplace } from "@/components/marketplace/mall-marketplace";
import { loadPublicShoppingMalls } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopping Mall Delivery in Lagos",
  description: "Shop mall vendors on Fast Fleets 360, pay with Squad, and get dispatch delivery estimates for Lagos and Ogun routes.",
  keywords: [
    "Fast Fleets 360 mall delivery",
    "FastFleets360 shopping mall",
    "FAST FLEETS360 mall",
    "FASTFLEETS 360 shopping",
    "Lagos mall delivery",
    "shopping delivery Lagos"
  ],
  alternates: {
    canonical: "/shopping-mall"
  },
  openGraph: {
    title: "Shopping Mall Delivery | Fast Fleets 360",
    description: "Choose mall items, add your address, pay with Squad, and track dispatch.",
    url: "/shopping-mall",
    type: "website"
  }
};

export default async function ShoppingMallPage() {
  const malls = await loadPublicShoppingMalls();

  return <MallMarketplace initialMalls={malls} />;
}
