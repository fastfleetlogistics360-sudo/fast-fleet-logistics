import type { Metadata } from "next";
import { OrderMarketplace } from "@/components/marketplace/order-marketplace";
import type { Store } from "@/components/marketplace/order-marketplace";

export const metadata: Metadata = {
  title: "Restaurants"
};

const restaurants: Store[] = [
  {
    name: "FastFleet Kitchen Partners",
    area: "Lekki",
    description: "Rice bowls, grills, and quick lunch packs",
    items: [
      { name: "Jollof rice and chicken", type: "Rice meal", price: 3500 },
      { name: "Fried rice and turkey", type: "Rice meal", price: 5200 },
      { name: "Ofada rice bowl", type: "Local special", price: 4200 },
      { name: "Chicken shawarma", type: "Wrap", price: 2800 }
    ]
  },
  {
    name: "Mainland Bites",
    area: "Yaba",
    description: "Affordable portions for teams and students",
    items: [
      { name: "Amala, ewedu and beef", type: "Swallow", price: 3000 },
      { name: "Pounded yam and egusi", type: "Swallow", price: 4500 },
      { name: "Spaghetti stir fry", type: "Pasta", price: 3200 },
      { name: "Plantain and grilled fish", type: "Grill", price: 6500 }
    ]
  },
  {
    name: "Island Cafe",
    area: "Victoria Island",
    description: "Breakfast, pastries, and office meals",
    items: [
      { name: "English breakfast", type: "Breakfast", price: 6000 },
      { name: "Chicken club sandwich", type: "Sandwich", price: 4800 },
      { name: "Beef burger and fries", type: "Burger", price: 5500 },
      { name: "Fresh parfait cup", type: "Dessert", price: 2500 }
    ]
  }
];

export default function RestaurantsPage() {
  return <OrderMarketplace title="Order restaurant meals with FastFleet." eyebrow="Restaurants" stores={restaurants} kind="restaurant" />;
}
