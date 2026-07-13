import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { LocationPermissionGate } from "@/components/location/location-permission-gate";
import { SiteShell } from "@/components/layout/site-shell";
import { PwaRegister } from "@/components/layout/pwa-register";
import { PushNotificationRegistrar } from "@/components/notifications/push-notification-registrar";

export const runtime = "nodejs";

const assetVersion = "20260629";
const brandLogo = `/brand/fastfleet-logo-2026.png?v=${assetVersion}`;
const brandIcon = `/icons/icon-192.png?v=${assetVersion}`;
const seoKeywords = [
  "Fast Fleets 360",
  "FastFleets360",
  "FASTFLEETS360",
  "FAST FLEETS360",
  "FASTFLEETS 360",
  "Fast Fleets 360 Logistics",
  "FastFleet Logistics Nigeria",
  "Lagos delivery",
  "Ogun delivery",
  "Lagos dispatch rider",
  "Ogun dispatch rider",
  "courier service Nigeria",
  "same day delivery Lagos",
  "bike delivery Lagos",
  "restaurant delivery Lagos",
  "shopping delivery Lagos",
  "business dispatch Nigeria",
  "verified riders Nigeria",
  "delivery wallet Nigeria",
  "Squad payment delivery"
];
const structuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Fast Fleets 360 Logistics",
  alternateName: ["FastFleets360", "FASTFLEETS360", "FAST FLEETS360", "FASTFLEETS 360", "Fast Fleets 360"],
  url: "https://fastfleet.com.ng",
  logo: "https://fastfleet.com.ng/brand/fastfleet-logo-2026.png?v=20260629",
  sameAs: ["https://www.instagram.com/fastfleets360", "https://x.com/fastfleets360", "https://www.tiktok.com/@fastfleets360"],
  areaServed: ["Lagos", "Ogun", "Nigeria"],
  serviceType: ["Courier service", "Same-day delivery", "Restaurant delivery", "Shopping delivery", "Business dispatch"]
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://fastfleet.com.ng"),
  title: {
    default: "Fast Fleets 360 Logistics",
    template: "%s | Fast Fleets 360 Logistics"
  },
  description: "Premium logistics marketplace for Lagos and Ogun deliveries, riders, fleets, wallets, and live tracking.",
  applicationName: "Fast Fleets 360",
  authors: [{ name: "Fast Fleets 360 Logistics", url: "https://fastfleet.com.ng" }],
  creator: "Fast Fleets 360 Logistics",
  publisher: "Fast Fleets 360 Logistics",
  category: "Logistics, Delivery, Marketplace",
  keywords: seoKeywords,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Fast Fleets 360 Logistics",
    description: "Book, track, and manage dispatch deliveries with wallet payments and verified riders.",
    url: "/",
    siteName: "Fast Fleets 360 Logistics",
    images: [{ url: brandLogo, width: 1254, height: 1254, alt: "Fast Fleets 360 Logistics" }],
    locale: "en_NG",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Fast Fleets 360 Logistics",
    description: "Fast dispatch, verified riders, wallet payments, and live delivery tracking."
  },
  manifest: `/manifest.webmanifest?v=${assetVersion}`,
  icons: {
    icon: brandIcon,
    apple: `/icons/icon-180.png?v=${assetVersion}`
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  },
  appleWebApp: {
    capable: true,
    title: "Fast Fleets 360",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f3460",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Fast Fleets 360" />
        <meta name="keywords" content={seoKeywords.join(", ")} />
        <link rel="apple-touch-icon" href={`/icons/icon-180.png?v=${assetVersion}`} />
        <link rel="apple-touch-startup-image" href={`/splash/splash-1170x2532.png?v=${assetVersion}`} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      </head>
      <body>
        <PwaRegister />
        <PushNotificationRegistrar />
        <LocationPermissionGate />
        <SiteShell>
          {children}
        </SiteShell>
      </body>
    </html>
  );
}
