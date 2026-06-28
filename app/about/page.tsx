import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bike, BriefcaseBusiness, CircleHelp, FileText, MapPinned, ShieldCheck } from "lucide-react";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";

export const metadata: Metadata = {
  title: "About Fast Fleets 360"
};

const links = [
  { title: "Become a Rider", href: "/rider/onboarding", icon: Bike },
  { title: "Register a Business", href: "/business/register", icon: BriefcaseBusiness },
  { title: "Frequently Asked Questions", href: "/support", icon: CircleHelp },
  { title: "Terms of Service", href: "/terms", icon: FileText },
  { title: "Privacy and Data Rights", href: "/privacy", icon: ShieldCheck }
];

export default function AboutPage() {
  return (
    <>
      <CinematicPageHero
        eyebrow="About Fast Fleets 360"
        title="Built for reliable movement across growing communities."
        body="Fast Fleets 360 connects customers, riders, and businesses through an easier, more accountable delivery experience."
        image="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2200&q=84"
      />
      <section className="section-wrap grid gap-6 py-8 sm:py-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Our mission</span>
          <h2 className="mt-3 text-2xl font-black leading-tight text-fleet-night sm:text-3xl">Make local delivery feel dependable, visible, and fair.</h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">We are building a logistics platform that helps people send with confidence, helps businesses serve customers better, and creates structured opportunities for riders.</p>
          <div className="mt-6 rounded-[20px] border border-white/80 bg-white/[0.90] p-4 shadow-[0_16px_42px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/35 backdrop-blur-2xl">
            <div className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-fleet-gold text-fleet-night"><MapPinned className="h-4 w-4" /></span>
              <div><strong className="block text-base font-black text-fleet-night">Launch states</strong><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">The soft launch is scheduled for Lagos State, Ogun State, and Kwara State in August 2026.</p></div>
            </div>
          </div>
        </div>
        <nav className="grid content-start gap-2 rounded-[20px] border border-white/80 bg-white/[0.90] p-3 shadow-[0_16px_42px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/35 backdrop-blur-2xl" aria-label="About Fast Fleets 360 links">
          {links.map((item) => {
            const Icon = item.icon;
            return <Link key={item.title} href={item.href} className="flex min-h-12 items-center gap-3 rounded-[14px] px-2 py-2 text-sm font-black text-fleet-night transition hover:bg-fleet-paper hover:text-fleet-ember"><span className="grid h-9 w-9 place-items-center rounded-[12px] bg-fleet-paper text-fleet-navy"><Icon className="h-4 w-4" /></span><span className="flex-1">{item.title}</span><ArrowUpRight className="h-4 w-4" /></Link>;
          })}
        </nav>
      </section>
    </>
  );
}
