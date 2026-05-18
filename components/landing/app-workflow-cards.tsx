"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Building2, PackageCheck, Route, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

const workflowCards: Array<{
  label: string;
  title: string;
  body: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    label: "Dispatch",
    title: "Same-day delivery requests",
    body: "Book verified riders for documents, retail parcels, food, groceries, pharmacy runs, and urgent errands.",
    icon: PackageCheck,
    tone: "bg-fleet-ember text-white"
  },
  {
    label: "Tracking",
    title: "Live customer visibility",
    body: "Track pickup, courier assignment, transit, and delivery completion from a clean customer dashboard.",
    icon: Route,
    tone: "bg-fleet-blue text-white"
  },
  {
    label: "Business",
    title: "Vendor dispatch control",
    body: "Built for vendors, offices, stores, and fleet partners that need repeat logistics without messy spreadsheets.",
    icon: Building2,
    tone: "bg-fleet-leaf text-white"
  }
];

export function AppWorkflowCards() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="overflow-hidden bg-gradient-to-b from-white to-[#f7fbff] py-12 sm:py-16">
      <div className="section-wrap">
        <motion.div
          className="mx-auto max-w-4xl text-center"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="text-xs font-black uppercase tracking-[0.2em] text-fleet-ember">FastFleet app</span>
          <h2 className="mt-3 text-3xl font-black leading-tight text-fleet-night sm:text-5xl">
            Dispatch riders, delivery tracking, and business logistics in one app.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
            Swipe through the core FastFleet workflows, then create an account or onboard as a driver or business.
          </p>
        </motion.div>

        <div className="-mx-4 mt-9 flex gap-4 overflow-x-auto px-4 pb-5 [scrollbar-width:thin] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
          {workflowCards.map((card, index) => {
            const Icon = card.icon;

            return (
              <motion.article
                key={card.label}
                className="relative min-h-[220px] w-[min(82vw,370px)] shrink-0 overflow-hidden rounded-fleet border border-fleet-line bg-white p-5 shadow-[0_18px_40px_rgba(8,17,31,0.08)] lg:w-auto"
                initial={reduceMotion ? false : { opacity: 0, y: 30, rotate: index === 1 ? 0 : index === 0 ? -0.6 : 0.6 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotate: 0 }}
                whileHover={reduceMotion ? undefined : { y: -6, rotate: index === 1 ? 0 : index === 0 ? -0.45 : 0.45 }}
                viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.56, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-fleet-ember via-fleet-leaf to-fleet-blue" />
                <div className="flex items-start justify-between gap-4">
                  <span className={`grid h-12 w-12 place-items-center rounded-fleet shadow-lift ${card.tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="rounded-full bg-fleet-paper px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    0{index + 1}
                  </span>
                </div>
                <span className="mt-6 block text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">{card.label}</span>
                <h3 className="mt-3 text-2xl font-black leading-tight text-fleet-night">{card.title}</h3>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{card.body}</p>
              </motion.article>
            );
          })}
        </div>

        <motion.div
          className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-70px" }}
          transition={{ duration: 0.48, delay: 0.18 }}
        >
          <LinkButton href="/auth" size="lg">
            Create account
            <ArrowRight className="h-4 w-4" />
          </LinkButton>
          <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet border border-fleet-line bg-white px-5 text-sm font-black text-fleet-night shadow-[0_12px_28px_rgba(8,17,31,0.06)]">
            <Smartphone className="h-4 w-4 text-fleet-ember" />
            App Store and Google Play coming soon
          </span>
        </motion.div>
      </div>
    </section>
  );
}
