import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderMarketplace } from "@/components/marketplace/order-marketplace";
import { loadPublicRestaurantKitchens } from "@/lib/public-content";

type KitchenPageProps = {
  params: Promise<{ kitchenId: string }>;
};

export async function generateMetadata({ params }: KitchenPageProps): Promise<Metadata> {
  const { kitchenId } = await params;
  const kitchens = await loadPublicRestaurantKitchens();
  const kitchen = kitchens.find((item) => item.id === kitchenId);

  return {
    title: `${kitchen?.name || "Restaurant"} | Fast Fleets 360`,
    description: kitchen?.description || "Order directly from a Fast Fleets 360 restaurant vendor.",
    alternates: {
      canonical: `/restaurants/${kitchenId}`
    }
  };
}

export default async function RestaurantKitchenPage({ params }: KitchenPageProps) {
  const { kitchenId } = await params;
  const kitchens = await loadRestaurantKitchens();
  const kitchen = kitchens.find((item) => item.id === kitchenId);
  if (!kitchen) notFound();

  return (
    <OrderMarketplace
      title={`${kitchen.name} kitchen`}
      eyebrow="Restaurant kitchen"
      stores={[kitchen]}
      kind="restaurant"
    />
  );
}

async function loadRestaurantKitchens() {
  return loadPublicRestaurantKitchens();
}
