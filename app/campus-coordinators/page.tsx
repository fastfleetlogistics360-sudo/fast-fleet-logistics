import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bike, Building2, MapPinned, MessagesSquare, ShieldCheck } from "lucide-react";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";

const siteUrl = "https://fastfleet.com.ng";

export const metadata: Metadata = {
  title: "Campus Coordinators | Fast Fleets 360",
  description: "Fast Fleets 360 Campus Coordinators support organized delivery operations, local vendor onboarding, rider coordination, and service communication around university communities.",
  keywords: ["Fast Fleets campus coordinators", "campus delivery coordinators Nigeria", "university delivery programme", "campus logistics"],
  alternates: { canonical: "/campus-coordinators" },
  openGraph: { title: "Campus Coordinators | Fast Fleets 360", description: "Local coordination for dependable university-community delivery.", url: "/campus-coordinators", type: "website" }
};

const responsibilities = [
  { icon: Building2, title: "Local vendor connection", body: "Help campus-area businesses understand how to prepare, hand over, and track orders through Fast Fleets 360." },
  { icon: Bike, title: "Rider coordination", body: "Support clear communication around campus delivery activity, rider access, pickup readiness, and operational updates." },
  { icon: MessagesSquare, title: "Community support", body: "Give students, staff, vendors, and riders a clear local point of contact for service information and practical feedback." }
];

export default function CampusCoordinatorsPage() {
  const structuredData = { "@context": "https://schema.org", "@type": "WebPage", name: "Campus Coordinators | Fast Fleets 360", url: `${siteUrl}/campus-coordinators`, description: "Fast Fleets 360 Campus Coordinators help support delivery operations, vendors, riders, and customers in university communities.", mainEntity: { "@type": "Service", name: "Fast Fleets 360 Campus Coordinators", provider: { "@type": "Organization", name: "Fast Fleets 360 Logistics", url: siteUrl }, serviceType: "Campus logistics coordination", areaServed: "Nigeria" } };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <CinematicPageHero eyebrow="Fast Fleets 360 community programme" title="Local coordination for better campus delivery." body="Campus Coordinators help Fast Fleets 360 connect riders, vendors, students, and university communities with more organized delivery support." image="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=2200&q=84" />
    <section className="section-wrap py-8 sm:py-12"><div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]"><div><span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Campus Coordinators</span><h2 className="mt-3 text-3xl font-black leading-tight text-fleet-night">A practical bridge between campus communities and dependable delivery.</h2><p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-600">Fast Fleets 360 Campus Coordinators help establish clear communication and better operational flow around university communities. They support the people closest to campus delivery: local businesses, delivery riders, and the students and staff they serve.</p><div className="mt-6 rounded-[20px] border border-fleet-line bg-fleet-paper p-5"><div className="flex items-start gap-3"><MapPinned className="mt-0.5 h-5 w-5 text-fleet-ember" /><p className="text-sm font-semibold leading-6 text-slate-700">Campus delivery availability, pricing, and operational programmes are configured by Fast Fleets 360 for each active location. Coordinators do not replace the platform&apos;s safety, payment, or support controls.</p></div></div></div><div className="grid gap-3">{responsibilities.map((item) => { const Icon = item.icon; return <article key={item.title} className="rounded-[20px] border border-fleet-line bg-white p-5 shadow-[0_12px_30px_rgba(8,17,31,0.06)]"><span className="grid h-10 w-10 place-items-center rounded-[13px] bg-fleet-paper text-fleet-ember"><Icon className="h-4 w-4" /></span><h3 className="mt-4 text-lg font-black text-fleet-night">{item.title}</h3><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.body}</p></article>; })}</div></div></section>
    <section className="section-wrap pb-12 sm:pb-16"><div className="flex flex-col gap-4 rounded-[24px] bg-fleet-night p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8"><div><div className="flex items-center gap-2 text-fleet-gold"><ShieldCheck className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-[0.14em]">Built for responsible growth</span></div><h2 className="mt-2 text-2xl font-black">Bring Fast Fleets 360 to your community.</h2><p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/75">We are building delivery programmes that respect the rhythm, safety, and needs of local university communities.</p></div><Link href="/support" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet bg-white px-5 text-sm font-black text-fleet-night transition hover:bg-fleet-gold">Contact support <ArrowUpRight className="h-4 w-4" /></Link></div></section>
  </>;
}
