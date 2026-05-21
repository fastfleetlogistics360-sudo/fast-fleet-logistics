import type { Metadata } from "next";
import { OrderMarketplace } from "@/components/marketplace/order-marketplace";
import type { Store } from "@/components/marketplace/order-marketplace";

export const metadata: Metadata = {
  title: "Shopping Mall"
};

const malls: Store[] = [
  {
    name: "FastFleet Mall Pickup",
    area: "Ikeja City Mall",
    description: "Essentials, gifts, and personal shopping",
    items: [
      { name: "Phone charger", type: "Electronics", price: 6500 },
      { name: "Bluetooth earbuds", type: "Electronics", price: 18000 },
      { name: "Gift perfume", type: "Beauty", price: 24000 },
      { name: "Office notebook pack", type: "Stationery", price: 4500 }
    ]
  },
  {
    name: "Lekki Retail Stop",
    area: "Circle Mall",
    description: "Groceries and same-day retail pickup",
    items: [
      { name: "Grocery essentials bag", type: "Groceries", price: 15000 },
      { name: "Kids lunch set", type: "Household", price: 8500 },
      { name: "Skincare starter pack", type: "Beauty", price: 30000 },
      { name: "T-shirt pack", type: "Fashion", price: 12000 }
    ]
  },
  {
    name: "VI Shopping Desk",
    area: "Victoria Island",
    description: "Office supplies and premium store pickup",
    items: [
      { name: "Printer paper carton", type: "Office", price: 22000 },
      { name: "Executive pen set", type: "Office", price: 9000 },
      { name: "Laptop sleeve", type: "Accessories", price: 14000 },
      { name: "Snack restock box", type: "Groceries", price: 18500 }
    ]
  }
];

export default function ShoppingMallPage() {
  return <OrderMarketplace title="Order mall items with FastFleet delivery." eyebrow="Shopping mall" stores={malls} kind="shopping" />;
}
