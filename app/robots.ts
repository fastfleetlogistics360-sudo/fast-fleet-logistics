import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://www.fastfleet.com.ng";

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
        "/auth",
        "/checkout",
        "/investor",
        "/support/cases",
        "/wallet",
        "/choose-account-type",
        "/delivery/callback",
        "/wallet/callback",
        "/marketplace/callback"
      ]
    },
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
