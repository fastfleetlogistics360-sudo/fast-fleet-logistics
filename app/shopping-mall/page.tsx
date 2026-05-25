import type { Metadata } from "next";
import { MallMarketplace } from "@/components/marketplace/mall-marketplace";

export const metadata: Metadata = {
  title: "Shopping Mall"
};

export default function ShoppingMallPage() {
  return <MallMarketplace />;
}
