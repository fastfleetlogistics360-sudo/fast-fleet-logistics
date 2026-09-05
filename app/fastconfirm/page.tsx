import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Camera, CheckCircle2, Clock3, MessageCircleWarning, PackageCheck, ShieldCheck } from "lucide-react";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";

const siteUrl = "https://fastfleet.com.ng";

export const metadata: Metadata = {
  title: "FastConfirm™ | Pickup Photo Confirmation for Delivery",
  description: "FastConfirm™ is Fast Fleets 360's pickup-photo confirmation feature. Customers can review a rider's package photo before the delivery continues.",
  keywords: ["FastConfirm", "FastConfirm Fast Fleets 360", "pickup photo confirmation", "package confirmation", "secure delivery Nigeria"],
  alternates: { canonical: "/fastconfirm" },
  openGraph: { title: "FastConfirm™ | Fast Fleets 360", description: "Confirm the pickup photo before your delivery continues.", url: "/fastconfirm", type: "website" }
};

const steps = [
  { icon: Camera, title: "Rider uploads a pickup photo", body: "For eligible deliveries, the rider records a photo after collecting the package and before starting the trip." },
  { icon: CheckCircle2, title: "Customer reviews it securely", body: "The customer sees the pickup photo in the authenticated delivery experience and can confirm that it is the correct package." },
  { icon: ShieldCheck, title: "The delivery proceeds with confidence", body: "A confirmed photo lets the rider continue. If the customer flags a mismatch, the rider is asked to provide another photo and the event is recorded." }
];

export default function FastConfirmPage() {
  const structuredData = { "@context": "https://schema.org", "@type": "WebPage", name: "FastConfirm™ | Fast Fleets 360", url: `${siteUrl}/fastconfirm`, description: "FastConfirm is a pickup-photo confirmation feature that lets eligible Fast Fleets 360 customers review a package before delivery continues.", mainEntity: { "@type": "Service", name: "FastConfirm™", provider: { "@type": "Organization", name: "Fast Fleets 360 Logistics", url: siteUrl }, serviceType: "Pickup photo confirmation for deliveries", areaServed: "Nigeria" } };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <CinematicPageHero eyebrow="FastConfirm™ by Fast Fleets 360" title="Confirm the pickup. Then follow the delivery." body="FastConfirm™ gives eligible customers a clear pickup-photo check before a rider continues with the delivery." image="https://images.unsplash.com/photo-1580674684081-7617fbf3d745?auto=format&fit=crop&w=2200&q=84" />
    <section className="section-wrap py-8 sm:py-12">
      <div className="mx-auto max-w-3xl text-center"><span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">A Fast Fleets 360 standout feature</span><h2 className="mt-3 text-3xl font-black leading-tight text-fleet-night sm:text-4xl">A simple check that brings more confidence to delivery.</h2><p className="mt-4 text-base font-semibold leading-7 text-slate-600">FastConfirm™ helps customers verify that the right package has been picked up. It creates a clear moment of confirmation between pickup and transit—without slowing down the delivery experience.</p></div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">{steps.map((step) => { const Icon = step.icon; return <article key={step.title} className="rounded-[22px] border border-fleet-line bg-white p-5 shadow-[0_14px_36px_rgba(8,17,31,0.07)]"><span className="grid h-11 w-11 place-items-center rounded-[14px] bg-fleet-paper text-fleet-ember"><Icon className="h-5 w-5" /></span><h3 className="mt-5 text-lg font-black text-fleet-night">{step.title}</h3><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{step.body}</p></article>; })}</div>
    </section>
    <section className="section-wrap pb-12 sm:pb-16"><div className="grid gap-5 rounded-[24px] border border-fleet-line bg-fleet-paper p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7"><div><div className="flex items-center gap-2 text-fleet-ember"><Clock3 className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-[0.14em]">Clear review window</span></div><h2 className="mt-2 text-2xl font-black text-fleet-night">Built for accountability at pickup.</h2><p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">When a review is pending, FastConfirm™ gives the customer time to respond. A reported mismatch is captured for support follow-up, helping Fast Fleets 360 maintain a traceable delivery record.</p></div><Link href="/book" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet bg-fleet-navy px-5 text-sm font-black text-white transition hover:bg-fleet-night">Book a delivery <ArrowUpRight className="h-4 w-4" /></Link></div><p className="mt-4 flex items-center gap-2 text-xs font-bold leading-5 text-slate-500"><MessageCircleWarning className="h-4 w-4 shrink-0 text-fleet-ember" />FastConfirm™ availability depends on the delivery type and its pickup-confirmation requirements.</p></section>
  </>;
}
