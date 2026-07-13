import type { Metadata } from "next";
import { MallMarketplace } from "@/components/marketplace/mall-marketplace";
import { loadPublicShoppingMalls } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopping Delivery in Lagos",
  description: "Shop grocery, pharmacy, fashion, and everyday vendors on Fast Fleets 360, pay with Squad, and get dispatch delivery estimates for Lagos and Ogun routes.",
  keywords: [
    "Fast Fleets 360 shopping delivery",
    "FastFleets360 shopping",
    "FAST FLEETS360 shopping",
    "FASTFLEETS 360 shopping",
    "Lagos shopping delivery",
    "grocery delivery Lagos",
    "pharmacy delivery Lagos",
    "fashion delivery Lagos"
  ],
  alternates: {
    canonical: "/shopping"
  },
  openGraph: {
    title: "Shopping Delivery | Fast Fleets 360",
    description: "Choose a shopping category, pick a vendor, add items, pay with Squad, and track dispatch.",
    url: "/shopping",
    type: "website"
  }
};

export default async function ShoppingPage() {
  const malls = await loadPublicShoppingMalls();

  return <MallMarketplace initialMalls={malls} />;
}
