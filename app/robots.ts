import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://fastfleet.com.ng").replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/rider/dashboard", "/business/dashboard", "/dashboard"]
    },
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
