import type { Metadata } from "next";
import { FastErrandCheckout } from "@/components/fast-errands/fast-errand-checkout";
import { loadFastErrandsCatalog, loadFastErrandsFulfilmentBusinessId } from "@/lib/fast-errands-catalog";

export const metadata: Metadata = {
  title: "FastErrands | Protected Shopping & Delivery",
  description: "FastErrands by Fast Fleets 360 lets customers order priced everyday items from verified fulfilment stores with a protected purchase budget and tracked delivery.",
  keywords: ["FastErrands", "errand delivery Nigeria", "protected shopping delivery", "Fast Fleets 360 errands"],
  alternates: { canonical: "/fast-errands" },
  openGraph: { title: "FastErrands | Fast Fleets 360", description: "Protected shopping errands and delivery from verified fulfilment stores.", url: "/fast-errands" }
};

export default async function FastErrandsPage() {
  const [catalog, fulfilmentBusinessId] = await Promise.all([loadFastErrandsCatalog(), loadFastErrandsFulfilmentBusinessId()]);
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Service", name: "FastErrands", provider: { "@type": "Organization", name: "Fast Fleets 360 Logistics", url: "https://fastfleet.com.ng" }, areaServed: "Nigeria", description: "A protected shopping and delivery service for priced everyday items from verified fulfilment stores." }) }} />
    <FastErrandCheckout catalog={catalog} fulfilmentConfigured={Boolean(fulfilmentBusinessId)} />
  </>;
}
