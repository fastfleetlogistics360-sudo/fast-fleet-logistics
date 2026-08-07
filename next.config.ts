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
      },
      {
        protocol: "https",
        hostname: "i.postimg.cc"
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com"
      }
    ]
  },

  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        // Next.js uses small inline bootstrap scripts and styles. This policy
        // still blocks unapproved external scripts, plugins, framing, and
        // connections while allowing the providers used by the application.
        value:
          "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://challenges.cloudflare.com; worker-src 'self' blob:; manifest-src 'self'"
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(self), usb=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000" }
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders
      },
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
