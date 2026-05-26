import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { AdvertHeroSlider } from "@/components/landing/advert-hero-slider";

const LiveLocationMap = dynamic(() => import("@/components/landing/live-location-map").then((mod) => mod.LiveLocationMap), {
  loading: () => <div className="h-[520px] bg-white" />
});
const HowItWorks = dynamic(() => import("@/components/landing/how-it-works").then((mod) => mod.HowItWorks), {
  loading: () => <div className="h-80 bg-fleet-night" />
});
const MainPageSections = dynamic(() => import("@/components/landing/main-page-sections").then((mod) => mod.MainPageSections), {
  loading: () => <div className="h-96 bg-white" />
});

export const metadata: Metadata = {
  title: "Book Same-Day Delivery",
  description: "Book, track, and manage same-day dispatch deliveries with FAST FLEETS360 across Lagos and Ogun."
};

export default function MainPage() {
  return (
    <>
      <AdvertHeroSlider />
      <LiveLocationMap />
      <HowItWorks />
      <MainPageSections />
    </>
  );
}
