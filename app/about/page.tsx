import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bike, BriefcaseBusiness, CircleHelp, FileText, Globe2, Mail, MapPinned, ShieldCheck, UserRound } from "lucide-react";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";

export const metadata: Metadata = {
  title: "About Fast Fleets 360 Logistics",
  description: "Fast Fleets 360 Logistics is a Nigerian logistics platform for dispatch booking, marketplace delivery, rider operations, business dispatch, payments, and live order tracking."
};

const links = [
  { title: "Become a Rider", href: "/rider/onboarding", icon: Bike },
  { title: "Register a Business", href: "/business/register", icon: BriefcaseBusiness },
  { title: "Frequently Asked Questions", href: "/support", icon: CircleHelp },
  { title: "Meet our Founder", href: "/founder", icon: UserRound },
  { title: "Terms of Service", href: "/terms", icon: FileText },
  { title: "Privacy and Data Rights", href: "/privacy", icon: ShieldCheck }
];

export default function AboutPage() {
  return (
    <>
      <CinematicPageHero
        eyebrow="About Fast Fleets 360"
        title="Built for reliable movement across growing communities."
        body="Fast Fleets 360 Logistics connects customers, riders, and businesses through a more accountable delivery experience."
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
      <section className="section-wrap pb-12 sm:pb-16">
        <div className="overflow-hidden rounded-[24px] border border-fleet-line bg-white shadow-[0_18px_46px_rgba(8,17,31,0.08)]">
          <div className="border-b border-fleet-line bg-fleet-paper px-5 py-5 sm:px-7">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Company identity</span>
            <h2 className="mt-2 text-2xl font-black text-fleet-night sm:text-3xl">Fast Fleets 360 Logistics</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Fast Fleets 360 Logistics is the business identity behind the Fast Fleets 360 delivery platform and the verified domain fastfleet.com.ng.</p>
          </div>
          <div className="grid gap-px bg-fleet-line sm:grid-cols-3">
            <IdentityFact icon={Globe2} title="Official website" value="fastfleet.com.ng" href="https://fastfleet.com.ng" />
            <IdentityFact icon={Mail} title="Customer support" value="support@fastfleet.com.ng" href="mailto:support@fastfleet.com.ng" />
            <IdentityFact icon={MapPinned} title="Service coverage" value="Lagos and Ogun, Nigeria" />
          </div>
          <div className="grid gap-3 p-5 text-sm font-semibold leading-6 text-slate-600 sm:grid-cols-2 sm:px-7 sm:py-6">
            <p>Our platform supports customer dispatch bookings, food and shopping delivery, business dispatch tools, rider onboarding, payment handling, receipts, and live delivery tracking.</p>
            <p>Our public website, official social accounts, support email, and WhatsApp ordering channel all operate under the Fast Fleets 360 Logistics name.</p>
          </div>
        </div>
        <div className="mt-6 rounded-[24px] border border-fleet-line bg-fleet-paper p-5 sm:p-7">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Bicycle investment programme</span>
          <h2 className="mt-2 text-2xl font-black text-fleet-night">Supporting productive bicycle assets.</h2>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Fast Fleets 360 works with approved bicycle investors to place and manage delivery assets within the network. Investors can view assigned bicycle activity, completed deliveries, and approved settlement information through a secure investor account, while Fast Fleets retains operational oversight of riders, safety, maintenance, and payouts.</p>
        </div>
      </section>
    </>
  );
}

function IdentityFact({ icon: Icon, title, value, href }: { icon: typeof Globe2; title: string; value: string; href?: string }) {
  const content = <><strong className="block text-sm font-black text-fleet-night">{title}</strong><span className="mt-1 block text-sm font-bold text-slate-600">{value}</span></>;
  return (
    <div className="flex items-start gap-3 bg-white p-5 sm:px-7">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-fleet-paper text-fleet-ember"><Icon className="h-4 w-4" /></span>
      {href ? <a href={href} className="min-w-0 transition hover:text-fleet-ember">{content}</a> : <div>{content}</div>}
    </div>
  );
}
