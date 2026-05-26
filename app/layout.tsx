import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteShell } from "@/components/layout/site-shell";
import { PageTransition } from "@/components/motion/page-transition";
import { PwaRegister } from "@/components/layout/pwa-register";
import { ThemeScript } from "@/components/layout/theme-script";

export const runtime = "nodejs";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://fastfleetlogistics.netlify.app"),
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
    images: [{ url: "/fastfleet-logo.png", width: 512, height: 512, alt: "Fast Fleets 360 Logistics" }],
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
    icon: "/fastfleet-logo.png",
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
        <ThemeScript />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Fast Fleets 360" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1170x2532.png" />
      </head>
      <body>
        <PwaRegister />
        <SiteShell>
          <PageTransition>{children}</PageTransition>
        </SiteShell>
      </body>
    </html>
  );
}
