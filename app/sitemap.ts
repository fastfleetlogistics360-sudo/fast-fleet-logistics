import type { MetadataRoute } from "next";
import { defaultRestaurantKitchens } from "@/lib/restaurant-menu";

type SitemapEntry = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

const publicRoutes: SitemapEntry[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/main", changeFrequency: "daily", priority: 0.95 },
  { path: "/book", changeFrequency: "daily", priority: 0.95 },
  { path: "/track", changeFrequency: "daily", priority: 0.9 },
  { path: "/restaurants", changeFrequency: "daily", priority: 0.9 },
  { path: "/shopping-mall", changeFrequency: "daily", priority: 0.9 },
  { path: "/services", changeFrequency: "weekly", priority: 0.85 },
  { path: "/how-it-works", changeFrequency: "weekly", priority: 0.85 },
  { path: "/rider/onboarding", changeFrequency: "weekly", priority: 0.82 },
  { path: "/business/register", changeFrequency: "weekly", priority: 0.82 },
  { path: "/marketplace/listing", changeFrequency: "weekly", priority: 0.76 },
  { path: "/support", changeFrequency: "weekly", priority: 0.72 },
  { path: "/updates", changeFrequency: "weekly", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.68 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.5 },
  { path: "/cookies", changeFrequency: "yearly", priority: 0.35 },
  { path: "/ndpr", changeFrequency: "yearly", priority: 0.35 }
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://fastfleet.com.ng").replace(/\/$/, "");
  const now = new Date();
  const kitchenRoutes: SitemapEntry[] = defaultRestaurantKitchens.map((kitchen) => ({
    path: `/restaurants/${kitchen.id}`,
    changeFrequency: "weekly",
    priority: 0.72
  }));

  return [...publicRoutes, ...kitchenRoutes].map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority
  }));
}
