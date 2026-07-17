import type { Metadata } from "next";
import { RestaurantVendorSelection } from "@/components/marketplace/order-marketplace";
import { loadPublicRestaurantKitchens } from "@/lib/public-content";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Restaurant Delivery in Lagos",
  description: "Order restaurant meals through Fast Fleets 360 with Squad checkout, delivery estimates, and dispatch tracking across Lagos and Ogun.",
  keywords: [
    "Fast Fleets 360 restaurant delivery",
    "FastFleets360 food delivery",
    "FASTFLEETS360 restaurants",
    "Lagos restaurant delivery",
    "food delivery Lagos",
    "Squad restaurant checkout"
  ],
  alternates: {
    canonical: "/restaurants"
  },
  openGraph: {
    title: "Restaurant Delivery | Fast Fleets 360",
    description: "Choose meals, add your address, pay with Squad, and track dispatch.",
    url: "/restaurants",
    type: "website"
  }
};

export default async function RestaurantsPage() {
  const stores = await loadPublicRestaurantKitchens();

  return <RestaurantVendorSelection stores={stores} />;
}
