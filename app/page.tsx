import type { Metadata } from "next";
import { LaunchLandingPage } from "@/components/landing/launch-landing-page";
import { loadPublicBrandPartners } from "@/lib/public-content";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Same-Day Dispatch in Lagos, Ogun and Oyo",
  description: "Fast Fleets 360 Logistics provides same-day dispatch for customers, riders, restaurants, shopping vendors, and businesses across Lagos, Ogun, and Oyo.",
  keywords: [
    "Fast Fleets 360",
    "FastFleets360",
    "FASTFLEETS360",
    "FAST FLEETS360",
    "FASTFLEETS 360",
    "Fast Fleets 360 Logistics",
    "same day dispatch Lagos",
    "Ogun delivery",
    "Oyo delivery",
    "Oyo dispatch rider",
    "Lagos courier service"
  ],
  alternates: {
    canonical: "/"
  }
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
            description: "Same-day dispatch across Lagos, Ogun, and Oyo",
            provider: { "@type": "Organization", name: "Fast Fleets 360 Logistics", url: "https://fastfleet.com.ng" }
          })
        }}
      />
      <LaunchLandingPage initialPartners={brandPartners} />
    </>
  );
}
