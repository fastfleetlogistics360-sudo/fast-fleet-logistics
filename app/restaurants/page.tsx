import type { Metadata } from "next";
import { OrderMarketplace } from "@/components/marketplace/order-marketplace";
import { loadPublicRestaurantKitchens } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Restaurants"
};

export default async function RestaurantsPage() {
  const stores = await loadPublicRestaurantKitchens();

  return <OrderMarketplace title="Order restaurant meals with Fast Fleets 360." eyebrow="Restaurants" stores={stores} kind="restaurant" />;
}
