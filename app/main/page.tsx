import type { Metadata } from "next";
import { AdvertHeroSlider } from "@/components/landing/advert-hero-slider";
import { HowItWorks } from "@/components/landing/how-it-works";

export const metadata: Metadata = {
  title: "Main Page"
};

export default function MainPage() {
  return (
    <>
      <AdvertHeroSlider />
      <HowItWorks />
    </>
  );
}
