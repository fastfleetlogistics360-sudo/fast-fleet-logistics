import type { Metadata } from "next";
import { Download, ExternalLink, MapPin, PackageCheck, Store } from "lucide-react";

const path = "/download";
const googlePlayUrl = "https://play.google.com/store/apps/details?id=com.fastfleetlogistics.app";

export const metadata: Metadata = {
  title: "Download the Fast Fleets 360 Logistics App",
  description: "Download Fast Fleets 360 Logistics on Google Play to book deliveries, track packages, shop local, and manage logistics in Nigeria.",
  alternates: { canonical: path },
  openGraph: {
    title: "Download Fast Fleets 360 Logistics",
    description: "Get the Fast Fleets 360 Logistics app on Google Play for delivery booking, tracking, shopping, and logistics tools.",
    url: path,
    type: "website"
  }
};

const appStructuredData = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "Fast Fleets 360 Logistics",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Android",
  downloadUrl: googlePlayUrl,
  installUrl: googlePlayUrl,
  url: "https://fastfleet.com.ng/download",
  applicationSuite: "Fast Fleets 360 Logistics",
  description: "Book deliveries, track packages, shop local essentials, and manage logistics with Fast Fleets 360 Logistics.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "NGN" },
  publisher: { "@id": "https://fastfleet.com.ng/#organization" }
};

const features = [
  { icon: PackageCheck, title: "Book and track deliveries", description: "Start a delivery request and keep up with its progress." },
  { icon: Store, title: "Shop local", description: "Explore restaurant, marketplace, and FastErrands options." },
  { icon: MapPin, title: "Manage logistics in one place", description: "Access tools built for customers, riders, and businesses." }
];

export default function DownloadPage() {
  return (
    <main className="site-canvas">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appStructuredData) }} />
      <section className="section-wrap py-12 sm:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Fast Fleets 360 on Android</p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-6xl">Get more done on the move.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg font-semibold leading-8 text-slate-600">Download Fast Fleets 360 Logistics from Google Play to book deliveries, track packages, shop local essentials, and manage your logistics from one place.</p>
          <a href={googlePlayUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center justify-center gap-3 rounded-[16px] bg-fleet-night px-6 py-4 text-base font-black text-white shadow-[0_16px_36px_rgba(8,17,31,0.20)] transition hover:-translate-y-0.5 hover:bg-fleet-ember">
            <Download className="h-5 w-5" /> Get it on Google Play <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <p className="mt-3 text-xs font-bold text-slate-500">Opens the official Fast Fleets 360 Logistics listing on Google Play.</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-[20px] border border-fleet-line bg-white p-6 shadow-[0_12px_32px_rgba(8,17,31,0.06)]">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-fleet-navy text-white"><Icon className="h-5 w-5" /></span>
              <h2 className="mt-4 text-lg font-black text-fleet-night">{title}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
