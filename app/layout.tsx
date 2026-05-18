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
    default: "FastFleet Logistics",
    template: "%s | FastFleet Logistics"
  },
  description: "Premium logistics marketplace for Lagos and Ogun deliveries, riders, fleets, wallets, and live tracking.",
  keywords: [
    "FastFleet Logistics",
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
    title: "FastFleet Logistics",
    description: "Book, track, and manage dispatch deliveries with wallet payments and verified riders.",
    url: "/",
    siteName: "FastFleet Logistics",
    images: [{ url: "/fastfleet-logo.png", width: 512, height: 512, alt: "FastFleet Logistics" }],
    locale: "en_NG",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "FastFleet Logistics",
    description: "Fast dispatch, verified riders, wallet payments, and live delivery tracking."
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/fastfleet-logo.png",
    apple: "/fastfleet-logo.png"
  },
  appleWebApp: {
    capable: true,
    title: "FastFleet",
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
