import type { Metadata } from "next";
import { OrderMarketplace } from "@/components/marketplace/order-marketplace";
import { defaultRestaurantKitchens } from "@/lib/restaurant-menu";

export const metadata: Metadata = {
  title: "Restaurants"
};

export default function RestaurantsPage() {
  return <OrderMarketplace title="Order restaurant meals with Fast Fleets 360." eyebrow="Restaurants" stores={defaultRestaurantKitchens} kind="restaurant" />;
}
