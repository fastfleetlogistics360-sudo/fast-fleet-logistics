import type { Metadata } from "next";
import { FastErrandCheckout } from "@/components/fast-errands/fast-errand-checkout";
import { loadFastErrandsCatalog, loadFastErrandsFulfilmentBusinessId } from "@/lib/fast-errands-catalog";

export const metadata: Metadata = { title: "FastErrands | Fast Fleets 360", description: "Protected purchase errands from verified Fast Fleets 360 stores." };

export default async function FastErrandsPage() {
  const [catalog, fulfilmentBusinessId] = await Promise.all([loadFastErrandsCatalog(), loadFastErrandsFulfilmentBusinessId()]);
  return <FastErrandCheckout catalog={catalog} fulfilmentConfigured={Boolean(fulfilmentBusinessId)} />;
}
