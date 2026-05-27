import type { MetadataRoute } from "next";

const routes = [
  "",
  "/main",
  "/auth",
  "/book",
  "/track",
  "/restaurants",
  "/shopping-mall",
  "/privacy",
  "/terms",
  "/cookies",
  "/ndpr",
  "/rider/onboarding",
  "/support",
  "/waitlist/thank-you",
  "/offline"
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://fastfleet.com.ng").replace(/\/$/, "");
  const now = new Date();

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.8
  }));
}
