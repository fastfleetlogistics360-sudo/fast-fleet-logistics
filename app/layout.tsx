import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { LocationPermissionGate } from "@/components/location/location-permission-gate";
import { SiteShell } from "@/components/layout/site-shell";
import { PwaRegister } from "@/components/layout/pwa-register";

export const runtime = "nodejs";

const brandLogo = "/brand/fastfleet-logo-2026.png";
const brandIcon = "/brand/fastfleet-logo-2026-header.png";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://fastfleet.com.ng"),
  title: {
    default: "Fast Fleets 360 Logistics",
    template: "%s | Fast Fleets 360 Logistics"
  },
  description: "Premium logistics marketplace for Lagos and Ogun deliveries, riders, fleets, wallets, and live tracking.",
  keywords: [
    "Fast Fleets 360 Logistics",
    "Lagos delivery",
    "Ogun dispatch",
    "courier service Nigeria",
    "bike delivery",
    "same day delivery",
    "driver KYC",
    "Paystack wallet"
  ],
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
  manifest: "/manifest.webmanifest",
  icons: {
    icon: brandIcon,
    apple: "/icons/icon-180.png"
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
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1170x2532.png" />
      </head>
      <body>
        <PwaRegister />
        <LocationPermissionGate />
        <SiteShell>
          {children}
        </SiteShell>
      </body>
    </html>
  );
}
