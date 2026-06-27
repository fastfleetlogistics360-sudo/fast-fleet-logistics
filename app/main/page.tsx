import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { AdvertHeroSlider } from "@/components/landing/advert-hero-slider";
import { mainHeroSlidesSettingsKey, normalizeMainHeroSlides } from "@/lib/main-hero-slides";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 300;

const LiveLocationMap = nextDynamic(() => import("@/components/landing/live-location-map").then((mod) => mod.LiveLocationMap), {
  loading: () => <div className="h-[520px] bg-white" />
});
const HowItWorks = nextDynamic(() => import("@/components/landing/how-it-works").then((mod) => mod.HowItWorks), {
  loading: () => <div className="h-80 bg-fleet-night" />
});
const MainPageSections = nextDynamic(() => import("@/components/landing/main-page-sections").then((mod) => mod.MainPageSections), {
  loading: () => <div className="h-96 bg-white" />
});

export const metadata: Metadata = {
  title: "Book Same-Day Delivery",
  description: "Book, track, and manage same-day dispatch deliveries with Fast Fleets 360 across Lagos and Ogun."
};

export default async function MainPage() {
  const heroSlides = await loadMainHeroSlides();

  return (
    <>
      <AdvertHeroSlider slides={heroSlides} />
      <LiveLocationMap />
      <HowItWorks />
      <MainPageSections />
    </>
  );
}

async function loadMainHeroSlides() {
  try {
    const supabase = createAdminClient();
    if (!supabase) return normalizeMainHeroSlides(null);

    const { data, error } = await supabase.from("platform_settings").select("value").eq("key", mainHeroSlidesSettingsKey).maybeSingle();
    if (error) return normalizeMainHeroSlides(null);
    return normalizeMainHeroSlides(data?.value);
  } catch {
    return normalizeMainHeroSlides(null);
  }
}
