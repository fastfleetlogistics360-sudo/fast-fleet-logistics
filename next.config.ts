import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co"
      }
    ]
  },

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate"
          },
          {
            key: "Service-Worker-Allowed",
            value: "/"
          }
        ]
      }
    ];
  },

  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/mainpage.html", destination: "/main", permanent: true },
      { source: "/auth.html", destination: "/auth", permanent: true },
      { source: "/order.html", destination: "/book", permanent: true },
      { source: "/track.html", destination: "/track", permanent: true },
      { source: "/dashboard.html", destination: "/dashboard", permanent: true },
      { source: "/support.html", destination: "/support", permanent: true },
      { source: "/driver.html", destination: "/rider/onboarding", permanent: true },
      { source: "/register-driver.html", destination: "/rider/onboarding", permanent: true },
      { source: "/register-business.html", destination: "/business/register", permanent: true },
      { source: "/services.html", destination: "/main", permanent: true },
      { source: "/admin/index.html", destination: "/admin", permanent: true },
      { source: "/privacy.html", destination: "/privacy", permanent: true },
      { source: "/terms.html", destination: "/terms", permanent: true },
      { source: "/cookies.html", destination: "/cookies", permanent: true },
      { source: "/ndpr.html", destination: "/ndpr", permanent: true }
    ];
  }
};

export default nextConfig;
