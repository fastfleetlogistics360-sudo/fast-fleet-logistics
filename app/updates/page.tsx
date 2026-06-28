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
      <section id="launch" className="section-wrap py-8 sm:py-10">
        <div className="mx-auto grid max-w-4xl gap-3">
          {updates.map((update) => {
            const Icon = update.icon;
            return (
              <article key={update.title} className="rounded-[20px] border border-white/80 bg-white/[0.90] p-4 shadow-[0_16px_42px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/35 backdrop-blur-2xl">
                <div className="flex items-start gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-fleet-navy text-white"><Icon className="h-4 w-4" /></span>
                  <div>
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">{update.date}</span>
                    <h2 className="mt-1 text-xl font-black text-fleet-night">{update.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">{update.body}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mx-auto mt-6 flex max-w-4xl flex-wrap gap-3">
          <Link href="/business/register" className="inline-flex min-h-10 items-center gap-2 rounded-[14px] bg-fleet-ember px-4 text-sm font-black text-white transition hover:bg-[#f47e18]">Reserve a marketplace slot <ArrowUpRight className="h-4 w-4" /></Link>
          <Link href="/rider/onboarding" className="inline-flex min-h-10 items-center gap-2 rounded-[14px] border border-fleet-line bg-white px-4 text-sm font-black text-fleet-night transition hover:border-fleet-gold">Become a rider <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </>
  );
}
