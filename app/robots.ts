import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://fastfleet.com.ng").replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/hub",
        "/dashboard",
        "/customer/dashboard",
        "/rider/dashboard",
        "/business/dashboard",
        "/account",
        "/choose-account-type",
        "/delivery/callback",
        "/wallet/callback",
        "/marketplace/callback"
      ]
    },
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
