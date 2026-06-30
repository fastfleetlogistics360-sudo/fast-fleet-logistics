"use client";

import Link from "next/link";
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BellRing, BookOpenText, Compass, Headphones, LayoutDashboard, MapPinned, PackageCheck, ShoppingBag, Store, Truck, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/types/domain";
import type { HubPromotionSlide } from "@/lib/hub-promotion-slides";
import { roleHome } from "@/lib/auth/roles";
import { saveReturningProfile } from "@/lib/auth/returning-profile";
import { HubPromotionCarousel } from "@/components/hub/hub-promotion-carousel";

type HubAction = {
  title: string;
  href: string;
  icon: LucideIcon;
  tone: "navy" | "green" | "orange" | "blue" | "pink";
};

type HubGlance = {
  title: string;
  href: string;
  items: Array<{ label: string; value: string; helper: string }>;
};

function firstName(fullName: string | null, email: string | null) {
  const label = fullName || email?.split("@")[0] || "there";
  return label.trim().split(/\s+/)[0] || "there";
}

function avatarInitials(fullName: string | null, email: string | null) {
  const source = fullName || email?.split("@")[0] || "FF";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function QuickActionHub({
  role,
  fullName,
  email,
  avatarUrl,
  promotionSlides,
  glance
}: {
  role: UserRole;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  promotionSlides: HubPromotionSlide[];
  glance: HubGlance;
}) {
  const reduceMotion = useReducedMotion();
  const name = firstName(fullName, email);

  useEffect(() => {
    saveReturningProfile({ fullName: fullName || name, email });
  }, [email, fullName, name]);

  const actions: HubAction[] = [
    { title: "Dashboard", href: roleHome[role], icon: LayoutDashboard, tone: "navy" },
    { title: "Mall", href: "/shopping-mall", icon: ShoppingBag, tone: "green" },
    { title: "Marketplace Listing", href: "/marketplace/listing", icon: Store, tone: "navy" },
    { title: "Restaurants", href: "/restaurants", icon: Utensils, tone: "orange" },
    { title: "Book a Delivery", href: "/book", icon: Truck, tone: "orange" },
    { title: "Track a Delivery", href: "/track", icon: MapPinned, tone: "blue" },
    { title: "Explore Services", href: "/services", icon: Compass, tone: "blue" },
    { title: "Promotions & Updates", href: "/updates", icon: BellRing, tone: "pink" },
    { title: "About Fast Fleets 360", href: "/about", icon: BookOpenText, tone: "blue" },
    { title: "Contact Support", href: "/support", icon: Headphones, tone: "orange" }
  ];

  const toneClasses = {
    navy: "bg-[#eef3ff] text-[#0b1d3a]",
    green: "bg-[#eefaf4] text-[#15a36b]",
    orange: "bg-[#fff3ea] text-[#ff8a00]",
    blue: "bg-[#edf5ff] text-[#1677df]",
    pink: "bg-[#fff1f7] text-[#ca4eb8]"
  };

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-[radial-gradient(circle_at_top_left,rgba(244,126,24,0.08),transparent_28%),linear-gradient(180deg,#f8fafc,#eef3f8)] pb-24 text-fleet-night lg:pb-10">
      <div className="section-wrap max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-[74px] items-center justify-between gap-3 rounded-[22px] border border-white/80 bg-white/[0.90] px-3 py-3 text-fleet-night shadow-[0_18px_48px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/35 backdrop-blur-2xl sm:px-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full border border-white/80 bg-white object-cover shadow-[0_10px_22px_rgba(8,17,31,0.08)]" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fleet-navy text-sm font-black text-white">{avatarInitials(fullName, email)}</span>
            )}
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-slate-500">Good to see you,</span>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="truncate text-[0.95rem] font-black leading-tight text-fleet-night sm:text-base">{name}</h1>
                <span className="rounded-full border border-fleet-line bg-fleet-paper px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-[0.12em] text-fleet-ember">{role}</span>
              </div>
            </div>
          </div>
          <Link href="/" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[14px] border border-fleet-line bg-white px-3 text-xs font-black text-fleet-night shadow-[0_10px_24px_rgba(8,17,31,0.06)] transition hover:border-fleet-gold focus:outline-none focus:ring-4 focus:ring-fleet-gold/20">
            <Store className="h-4 w-4 text-fleet-ember" />
            <span>Website</span>
          </Link>
        </motion.section>

        <HubPromotionCarousel slides={promotionSlides} />

        <section className="mt-5 rounded-[22px] border border-white/80 bg-white/[0.90] p-3 shadow-[0_18px_48px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/35 backdrop-blur-2xl sm:p-4" aria-labelledby="quick-actions-title">
          <div className="flex items-center justify-between gap-3 px-1 pb-3">
            <h2 id="quick-actions-title" className="text-base font-black text-fleet-night">Quick Actions</h2>
            <Link href="/services" className="inline-flex items-center gap-1 text-sm font-black text-[#1677df] transition hover:text-fleet-ember">All Services <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-4 gap-x-1 gap-y-4 sm:gap-x-3 sm:gap-y-5">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <motion.div
                  key={action.title}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                >
                  <Link href={action.href} className="group grid min-h-[92px] place-items-center gap-2 rounded-[16px] px-1 py-1.5 text-center transition hover:bg-[#f6f8fa] focus:outline-none focus:ring-4 focus:ring-fleet-gold/20">
                    <span className={`grid h-12 w-12 place-items-center rounded-[15px] transition duration-200 group-hover:scale-105 ${toneClasses[action.tone]}`}>
                      <Icon className="h-5 w-5" strokeWidth={2.2} />
                    </span>
                    <span className="flex min-h-8 items-center justify-center text-[0.7rem] font-black leading-4 text-fleet-night">{action.title}</span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-[22px] bg-fleet-night p-4 text-white shadow-[0_16px_42px_rgba(8,17,31,0.16)] sm:p-5" aria-labelledby="glance-title">
          <div className="flex items-center justify-between gap-4">
            <h2 id="glance-title" className="text-lg font-black">{glance.title}</h2>
            <Link href={glance.href} className="inline-flex items-center gap-1 text-sm font-black text-[#53a4ff] transition hover:text-white">View all <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {glance.items.map((item) => (
              <div key={item.label} className="min-w-0">
                <span className="block text-xs font-bold text-white/65">{item.label}</span>
                <strong className="mt-2 block truncate text-lg font-black sm:text-xl">{item.value}</strong>
                <span className="mt-1 block text-xs font-semibold text-white/65">{item.helper}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
