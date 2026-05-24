import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536],
    imageSizes: [32, 48, 64, 96, 128, 192, 256, 384],
    qualities: [58, 60, 62, 64, 66, 68, 70, 74],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co"
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com"
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
      },
      {
        source: "/:path*.(png|jpg|jpeg|webp|avif|svg)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
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
