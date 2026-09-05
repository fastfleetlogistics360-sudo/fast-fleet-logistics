import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Building2, CalendarDays, Instagram, Lightbulb, MapPinned } from "lucide-react";

const siteUrl = "https://fastfleet.com.ng";
const founderName = "Abegunde Olasunkanmi Joshua";
const instagramUrl = "https://www.instagram.com/a.o.josh01";

export const metadata: Metadata = {
  title: "Abegunde Olasunkanmi Joshua — Founder & CEO",
  description: "Abegunde Olasunkanmi Joshua is the Founder and CEO of Fast Fleets 360 Logistics, a Nigerian entrepreneur and business leader building technology-led ventures.",
  alternates: { canonical: "/founder" },
  openGraph: {
    title: "Abegunde Olasunkanmi Joshua | Founder of Fast Fleets 360 Logistics",
    description: "Meet the entrepreneur and business leader behind Fast Fleets 360 Logistics.",
    url: "/founder",
    type: "profile"
  }
};

const ventures = [
  { name: "Fast Fleets 360 Logistics", role: "Founder and CEO", url: siteUrl },
  { name: "Vision-Adonai Ventures", role: "Managing Director", url: "https://www.vision-adonaiventures.com" },
  { name: "VAVDEVNOVA", role: "Founder", url: "https://www.vavdevnova.com.ng" },
  { name: "StartSmart Africa", role: "Founder", url: "https://www.startsmartafrica.org" }
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  "@id": `${siteUrl}/founder#profile`,
  url: `${siteUrl}/founder`,
  name: `${founderName} | Founder of Fast Fleets 360 Logistics`,
  mainEntity: {
    "@type": "Person",
    "@id": `${siteUrl}/founder#person`,
    name: founderName,
    birthDate: "2000-01-15",
    jobTitle: "Founder and Chief Executive Officer",
    url: `${siteUrl}/founder`,
    sameAs: [instagramUrl],
    worksFor: ventures.map((venture) => ({
      "@type": "Organization",
      name: venture.name,
      url: venture.url
    }))
  }
};

export default function FounderPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <section className="section-wrap py-8 sm:py-12">
        <div className="overflow-hidden rounded-[28px] border border-fleet-line bg-white shadow-[0_20px_54px_rgba(8,17,31,0.10)]">
          <div className="bg-fleet-night px-6 py-10 text-white sm:px-10 sm:py-14">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-fleet-gold">Founder of Fast Fleets 360 Logistics</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-5xl">Abegunde Olasunkanmi Joshua</h1>
            <p className="mt-5 max-w-3xl text-base font-semibold leading-7 text-white/80 sm:text-lg">Nigerian entrepreneur, technology visionary, and business leader building ventures at the intersection of logistics, innovation, technology, and enterprise.</p>
          </div>

          <div className="grid gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">About Joshua</span>
              <p className="mt-3 text-base font-semibold leading-8 text-slate-700">{founderName} is the Founder and CEO of Fast Fleets 360 Logistics, Managing Director of Vision-Adonai Ventures, and Founder of VAVDEVNOVA and StartSmart Africa.</p>
              <p className="mt-4 text-base font-semibold leading-8 text-slate-700">Driven by an ambition to build globally relevant African businesses, Joshua represents a new generation of founders transforming bold ideas into scalable ventures. His work is defined by innovation, strategic thinking, and a relentless commitment to creating businesses designed for lasting impact.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href={instagramUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-fleet bg-fleet-ember px-4 text-sm font-black text-white transition hover:bg-[#b94a08]"><Instagram className="h-4 w-4" />Follow on Instagram <ArrowUpRight className="h-4 w-4" /></a>
                <Link href="/about" className="inline-flex min-h-11 items-center gap-2 rounded-fleet border border-fleet-line px-4 text-sm font-black text-fleet-night transition hover:border-fleet-ember hover:text-fleet-ember">About Fast Fleets 360 <ArrowUpRight className="h-4 w-4" /></Link>
              </div>
            </div>

            <aside className="rounded-[20px] bg-fleet-paper p-5">
              <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 h-5 w-5 text-fleet-ember" /><div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Born</p><p className="mt-1 text-sm font-black text-fleet-night">January 15, 2000</p></div></div>
              <div className="mt-5 flex items-start gap-3"><MapPinned className="mt-0.5 h-5 w-5 text-fleet-ember" /><div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Based in</p><p className="mt-1 text-sm font-black text-fleet-night">Nigeria</p></div></div>
              <div className="mt-5 flex items-start gap-3"><Lightbulb className="mt-0.5 h-5 w-5 text-fleet-ember" /><div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Focus</p><p className="mt-1 text-sm font-black text-fleet-night">Logistics, technology, innovation, and enterprise</p></div></div>
            </aside>
          </div>
        </div>
      </section>

      <section className="section-wrap pb-12 sm:pb-16">
        <div className="rounded-[24px] border border-fleet-line bg-white p-6 shadow-[0_16px_42px_rgba(8,17,31,0.08)] sm:p-8">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Leadership and ventures</span>
          <h2 className="mt-2 text-2xl font-black text-fleet-night sm:text-3xl">Building businesses for lasting impact.</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {ventures.map((venture) => (
              <a key={venture.name} href={venture.url} target={venture.url === siteUrl ? undefined : "_blank"} rel={venture.url === siteUrl ? undefined : "noreferrer"} className="flex items-center gap-3 rounded-[18px] border border-fleet-line p-4 transition hover:border-fleet-ember hover:bg-fleet-paper">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-fleet-paper text-fleet-ember"><Building2 className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm font-black text-fleet-night">{venture.name}</strong><span className="mt-1 block text-sm font-semibold text-slate-600">{venture.role}</span></span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-fleet-ember" />
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
