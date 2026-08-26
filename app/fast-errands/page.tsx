import type { Metadata } from "next";
import { FastErrandCheckout } from "@/components/fast-errands/fast-errand-checkout";
import { loadPublicShoppingMalls } from "@/lib/public-content";

export const metadata: Metadata = { title: "FastErrands | Fast Fleets 360", description: "Protected purchase errands from verified Fast Fleets 360 stores." };

export default async function FastErrandsPage() {
  return <FastErrandCheckout malls={await loadPublicShoppingMalls()} />;
}
