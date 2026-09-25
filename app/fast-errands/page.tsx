import type { Metadata } from "next";
import { FastErrandCheckout } from "@/components/fast-errands/fast-errand-checkout";
import { loadFastErrandsCatalog, loadFastErrandsControls } from "@/lib/fast-errands-catalog";

export const metadata: Metadata = {
  title: "FastErrands | Protected Shopping & Delivery",
  description: "FastErrands by Fast Fleets 360 is a curated neighborhood procurement and tracked delivery service.",
  keywords: ["FastErrands", "errand delivery Nigeria", "neighborhood procurement", "Fast Fleets 360 errands"],
  alternates: { canonical: "/fast-errands" },
  openGraph: { title: "FastErrands | Fast Fleets 360", description: "Curated neighborhood procurement and delivery.", url: "/fast-errands" }
};

export default async function FastErrandsPage() {
  const [catalog, controls] = await Promise.all([loadFastErrandsCatalog(), loadFastErrandsControls()]);
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Service", name: "FastErrands", provider: { "@type": "Organization", name: "Fast Fleets 360 Logistics", url: "https://fastfleet.com.ng" }, areaServed: "Nigeria", description: "A curated neighborhood procurement and delivery service." }) }} />
    <FastErrandCheckout catalog={catalog} neighborhoodEnabled={controls.enabled && controls.mode === "neighborhood"} />
  </>;
}
