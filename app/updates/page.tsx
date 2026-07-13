import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BellRing, CheckCircle2, UsersRound } from "lucide-react";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";
import { enabledHubPromotionSlides, hubPromotionSlidesSettingsKey, type HubPromotionSlide } from "@/lib/hub-promotion-slides";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Promotions & Updates"
};

export const dynamic = "force-dynamic";

const updates = [
  { title: "Soft launch scheduled", date: "August 2026", body: "Fast Fleets 360 is preparing launch operations across Lagos, Ogun, and Kwara States.", icon: BellRing },
  { title: "Marketplace onboarding", date: "2 of 30 slots filled", body: "Nectar & Greens and FarmFresh by V-A.V are the first marketplace partners joining the platform.", icon: CheckCircle2 },
  { title: "Rider and business opportunities", date: "Open now", body: "Applications remain available for riders and businesses that want to be ready for the launch window.", icon: UsersRound }
];

export default async function UpdatesPage() {
  const promotions = await loadPromotionUpdates();

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
          {promotions.map((promotion) => (
            <article key={promotion.id} className="rounded-[20px] border border-white/80 bg-white/[0.90] p-4 shadow-[0_16px_42px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/35 backdrop-blur-2xl">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-fleet-ember text-white"><BellRing className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">{promotion.badgeText}</span>
                  <h2 className="mt-1 text-xl font-black text-fleet-night">{promotion.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">{promotion.description}</p>
                  {promotion.href ? (
                    <Link href={promotion.href} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-[14px] bg-fleet-night px-4 text-sm font-black text-white transition hover:bg-[#10233a]">
                      Open update <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  ) : null}
                </div>
                {promotion.image ? (
                  <div className="grid h-24 w-full shrink-0 place-items-center overflow-hidden rounded-[16px] border border-fleet-line bg-fleet-paper p-2 sm:w-32">
                    <img src={promotion.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
                  </div>
                ) : null}
              </div>
            </article>
          ))}
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

async function loadPromotionUpdates(): Promise<HubPromotionSlide[]> {
  try {
    const admin = createAdminClient();
    if (!admin) return [];
    const { data } = await admin.from("platform_settings").select("value").eq("key", hubPromotionSlidesSettingsKey).maybeSingle();
    return enabledHubPromotionSlides(data?.value);
  } catch {
    return [];
  }
}
