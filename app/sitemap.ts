import type { MetadataRoute } from "next";

const routes = [
  "",
  "/main",
  "/auth",
  "/book",
  "/track",
  "/dashboard",
  "/privacy",
  "/terms",
  "/cookies",
  "/ndpr",
  "/rider/onboarding",
  "/rider/dashboard",
  "/support",
  "/admin",
  "/waitlist/thank-you",
  "/offline"
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://fastfleetlogistics.pages.dev").replace(/\/$/, "");
  const now = new Date();

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : route.includes("dashboard") || route.includes("admin") ? 0.5 : 0.8
  }));
}
