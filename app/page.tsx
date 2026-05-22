import type { Metadata } from "next";
import { LaunchLandingPage } from "@/components/landing/launch-landing-page";

export const metadata: Metadata = {
  title: "Same-Day Dispatch in Lagos and Ogun",
  description: "FastFleet Logistics provides same-day dispatch for customers, riders, and businesses across Lagos and Ogun."
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "DeliveryEvent",
            name: "FastFleet Logistics",
            description: "Same-day dispatch across Lagos and Ogun",
            provider: { "@type": "Organization", name: "FastFleet Logistics", url: "https://fastfleet.com.ng" }
          })
        }}
      />
      <LaunchLandingPage />
    </>
  );
}
