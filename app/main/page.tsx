import type { Metadata } from "next";
import { AdvertDealsRail } from "@/components/landing/advert-deals-rail";
import { AdvertHeroSlider } from "@/components/landing/advert-hero-slider";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveLocationMap } from "@/components/landing/live-location-map";

export const metadata: Metadata = {
  title: "Book Same-Day Delivery",
  description: "Book, track, and manage same-day dispatch deliveries with FastFleet across Lagos and Ogun."
};

export default function MainPage() {
  return (
    <>
      <AdvertHeroSlider />
      <LiveLocationMap />
      <AdvertDealsRail />
      <HowItWorks />
    </>
  );
}
