import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BellRing, CheckCircle2, UsersRound } from "lucide-react";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";

export const metadata: Metadata = {
  title: "Promotions & Updates"
};

const updates = [
  { title: "Soft launch scheduled", date: "August 2026", body: "Fast Fleets 360 is preparing launch operations across Lagos, Ogun, and Kwara States.", icon: BellRing },
  { title: "Marketplace onboarding", date: "2 of 30 slots filled", body: "Nectar & Greens and FarmFresh by V-A.V are the first marketplace partners joining the platform.", icon: CheckCircle2 },
  { title: "Rider and business opportunities", date: "Open now", body: "Applications remain available for riders and businesses that want to be ready for the launch window.", icon: UsersRound }
];

export default function UpdatesPage() {
  return (
    <>
      <CinematicPageHero
        eyebrow="Platform news"
        title="Promotions, onboarding, and launch updates."
        body="A simple home for the announcements that shape the Fast Fleets 360 rollout."
        image="https://images.unsplash.com/photo-1551830820-330a71b99659?auto=format&fit=crop&w=2200&q=84"
      />
      <section id="launch" className="section-wrap py-10 sm:py-14">
        <div className="mx-auto max-w-4xl border-l-2 border-fleet-gold pl-5 sm:pl-8">
          {updates.map((update, index) => {
            const Icon = update.icon;
            return (
              <article key={update.title} className={index ? "mt-8 border-t border-fleet-line pt-8" : ""}>
                <div className="flex items-start gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fleet bg-fleet-navy text-white"><Icon className="h-5 w-5" /></span>
                  <div>
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">{update.date}</span>
                    <h2 className="mt-1 text-2xl font-black text-fleet-night">{update.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-slate-600">{update.body}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mx-auto mt-10 flex max-w-4xl flex-wrap gap-3 pl-5 sm:pl-8">
          <Link href="/business/register" className="inline-flex min-h-11 items-center gap-2 rounded-fleet bg-fleet-ember px-4 text-sm font-black text-white transition hover:bg-[#f47e18]">Reserve a marketplace slot <ArrowUpRight className="h-4 w-4" /></Link>
          <Link href="/rider/onboarding" className="inline-flex min-h-11 items-center gap-2 rounded-fleet border border-fleet-line bg-white px-4 text-sm font-black text-fleet-night transition hover:border-fleet-gold">Become a rider <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </>
  );
}
