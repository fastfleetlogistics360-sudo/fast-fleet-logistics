import type { Metadata } from "next";
import { LaunchLandingPage } from "@/components/landing/launch-landing-page";
import { loadPublicBrandPartners } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Same-Day Dispatch in Lagos and Ogun",
  description: "Fast Fleets 360 Logistics provides same-day dispatch for customers, riders, and businesses across Lagos and Ogun."
};

export default async function LandingPage() {
  const brandPartners = await loadPublicBrandPartners();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "DeliveryEvent",
            name: "Fast Fleets 360 Logistics",
            description: "Same-day dispatch across Lagos and Ogun",
            provider: { "@type": "Organization", name: "Fast Fleets 360 Logistics", url: "https://fastfleet.com.ng" }
          })
        }}
      />
      <LaunchLandingPage initialPartners={brandPartners} />
    </>
  );
}
