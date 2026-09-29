import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight, PackageCheck, Route } from "lucide-react";

const path = "/partners/kwara-media-fashion-week";
const image = "/partners/fast-fleets-360-kwara-media-fashion-week-official-logistics-partner.jpg";

export const metadata: Metadata = {
  title: "Official Logistics Partner of Kwara Media Fashion Week",
  description: "Fast Fleets 360 Logistics is the Official Logistics Partner of Kwara Media Fashion Week 1.0, supporting logistics for the fashion and media event in Kwara State, Nigeria.",
  alternates: { canonical: path },
  openGraph: {
    title: "Fast Fleets 360 — Official Logistics Partner of Kwara Media Fashion Week",
    description: "Fast Fleets 360 Logistics is the Official Logistics Partner of Kwara Media Fashion Week 1.0.",
    url: path,
    type: "article",
    images: [{ url: image, width: 1254, height: 1254, alt: "Fast Fleets 360 Logistics, Official Logistics Partner of Kwara Media Fashion Week" }]
  },
  twitter: { card: "summary_large_image", title: "Fast Fleets 360 × Kwara Media Fashion Week", description: "Official Logistics Partner of Kwara Media Fashion Week 1.0.", images: [image] }
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": "https://www.fastfleet.com.ng/partners/kwara-media-fashion-week#webpage",
    url: "https://www.fastfleet.com.ng/partners/kwara-media-fashion-week",
    name: "Fast Fleets 360 — Official Logistics Partner of Kwara Media Fashion Week",
    description: "Fast Fleets 360 Logistics is the Official Logistics Partner of Kwara Media Fashion Week 1.0.",
    about: [{ "@id": "https://www.fastfleet.com.ng/#organization" }, { "@id": "https://www.fastfleet.com.ng/partners/kwara-media-fashion-week#event" }],
    primaryImageOfPage: { "@id": "https://www.fastfleet.com.ng/partners/kwara-media-fashion-week#image" }
  },
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": "https://www.fastfleet.com.ng/partners/kwara-media-fashion-week#event",
    name: "Kwara Media Fashion Week 1.0",
    description: "Kwara Media Fashion Week 1.0, with Fast Fleets 360 Logistics as its Official Logistics Partner.",
    location: { "@type": "Place", name: "Kwara State, Nigeria" }
  },
  {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    "@id": "https://www.fastfleet.com.ng/partners/kwara-media-fashion-week#image",
    contentUrl: "https://www.fastfleet.com.ng/partners/fast-fleets-360-kwara-media-fashion-week-official-logistics-partner.jpg",
    caption: "Fast Fleets 360 Logistics, Official Logistics Partner of Kwara Media Fashion Week"
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.fastfleet.com.ng/" },
      { "@type": "ListItem", position: 2, name: "Partnerships", item: "https://www.fastfleet.com.ng/partners/kwara-media-fashion-week" },
      { "@type": "ListItem", position: 3, name: "Kwara Media Fashion Week" }
    ]
  }
];

export default function KwaraMediaFashionWeekPage() {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <main className="site-canvas">
      <section className="section-wrap pt-8 sm:pt-12">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-bold text-slate-600"><Link href="/" className="hover:text-fleet-ember">Home</Link><ChevronRight className="h-4 w-4" /><span>Partnerships</span><ChevronRight className="h-4 w-4" /><span aria-current="page" className="text-fleet-night">Kwara Media Fashion Week</span></nav>
        <div className="mt-6 grid items-center gap-8 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Partnership</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[1.05] text-fleet-night sm:text-5xl">Fast Fleets 360 × Kwara Media Fashion Week</h1>
            <p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-slate-600">Fast Fleets 360 Logistics is the Official Logistics Partner of Kwara Media Fashion Week 1.0.</p>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600">The partnership brings Fast Fleets 360&apos;s technology-enabled logistics perspective to a fashion and media event rooted in Kwara State, Nigeria. It reflects a shared focus on moving people, products, and creative work with care and coordination.</p>
          </div>
          <figure className="overflow-hidden rounded-[28px] border border-fleet-line bg-white p-2 shadow-[0_20px_55px_rgba(8,17,31,0.14)]">
            <Image src={image} alt="Fast Fleets 360 Logistics, Official Logistics Partner of Kwara Media Fashion Week" width={1254} height={1254} sizes="(min-width: 1024px) 42vw, 100vw" priority className="h-auto w-full rounded-[20px]" />
            <figcaption className="px-3 py-3 text-sm font-semibold text-slate-600">Moving fashion. Powering impact.</figcaption>
          </figure>
        </div>
      </section>
      <section className="section-wrap grid gap-4 py-10 sm:grid-cols-3 sm:py-14">
        <article className="rounded-[22px] border border-fleet-line bg-white p-5 shadow-[0_12px_32px_rgba(8,17,31,0.06)]"><PackageCheck className="h-6 w-6 text-fleet-ember" /><h2 className="mt-4 text-xl font-black text-fleet-night">Official logistics partnership</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Fast Fleets 360 is publicly recognised as the Official Logistics Partner for Kwara Media Fashion Week 1.0.</p></article>
        <article className="rounded-[22px] border border-fleet-line bg-white p-5 shadow-[0_12px_32px_rgba(8,17,31,0.06)]"><Route className="h-6 w-6 text-fleet-ember" /><h2 className="mt-4 text-xl font-black text-fleet-night">Built around movement</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Fast Fleets 360 connects delivery, commerce, and operational coordination through one logistics platform.</p></article>
        <article className="rounded-[22px] border border-fleet-line bg-white p-5 shadow-[0_12px_32px_rgba(8,17,31,0.06)]"><ArrowRight className="h-6 w-6 text-fleet-ember" /><h2 className="mt-4 text-xl font-black text-fleet-night">Discover the platform</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Explore Fast Fleets 360 services for dispatch, FastErrands, marketplace orders, and business logistics.</p><Link href="/services" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-fleet-ember hover:text-fleet-night">Explore services <ArrowRight className="h-4 w-4" /></Link></article>
      </section>
    </main>
  </>;
}
