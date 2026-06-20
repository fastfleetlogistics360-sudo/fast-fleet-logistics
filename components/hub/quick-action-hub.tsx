"use client";

import Link from "next/link";
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BellRing, BookOpenText, Box, Compass, CreditCard, Headphones, LayoutDashboard, MapPinned, PackageCheck, ShoppingBag, Store, Truck } from "lucide-react";
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

type HubShortcut = {
  title: string;
  href: string;
  icon: LucideIcon;
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

function shortcutsForRole(role: UserRole): HubShortcut[] {
  if (role === "rider") {
    return [
      { title: "My Orders", href: "/rider/dashboard/delivery-history", icon: Box },
      { title: "Payment Methods", href: "/rider/dashboard/withdrawals", icon: CreditCard },
      { title: "Help Center", href: "/support", icon: Headphones }
    ];
  }

  if (role === "business") {
    return [
      { title: "My Orders", href: "/business/dashboard#orders", icon: Box },
      { title: "Saved Addresses", href: "/business/dashboard#addresses", icon: MapPinned },
      { title: "Payment Methods", href: "/business/dashboard#wallet", icon: CreditCard },
      { title: "Help Center", href: "/support", icon: Headphones }
    ];
  }

  if (role === "admin") return [{ title: "Help Center", href: "/support", icon: Headphones }];

  return [
    { title: "My Orders", href: "/customer/dashboard#orders", icon: Box },
    { title: "Saved Addresses", href: "/customer/dashboard#addresses", icon: MapPinned },
    { title: "Payment Methods", href: "/customer/dashboard#wallet", icon: CreditCard },
    { title: "Help Center", href: "/support", icon: Headphones }
  ];
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
  const shortcuts = shortcutsForRole(role);

  useEffect(() => {
    saveReturningProfile({ fullName: fullName || name, email });
  }, [email, fullName, name]);

  const actions: HubAction[] = [
    { title: "Dashboard", href: roleHome[role], icon: LayoutDashboard, tone: "navy" },
    { title: "Marketplace", href: "/shopping-mall", icon: ShoppingBag, tone: "green" },
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
    <main className="min-h-[calc(100vh-4.5rem)] bg-[#f2f4f8] pb-24 text-fleet-night lg:pb-10">
      <div className="section-wrap max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-[76px] items-center justify-between gap-3 rounded-[14px] bg-fleet-night px-3 py-3 text-white shadow-[0_8px_20px_rgba(8,17,31,0.12)] sm:min-h-[82px] sm:px-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full border border-white/20 bg-white object-cover" />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/12 text-sm font-black text-fleet-gold">{avatarInitials(fullName, email)}</span>
            )}
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-white/70">Good to see you,</span>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="truncate text-[0.95rem] font-black leading-tight sm:text-base">{name}</h1>
                <span className="rounded-full border border-fleet-ember/80 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-[0.12em] text-fleet-gold">{role}</span>
              </div>
            </div>
          </div>
          <Link href="/" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-fleet border border-white/15 bg-white/10 px-3 text-xs font-black text-white transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-fleet-gold/20 sm:h-11 sm:px-4">
            <Store className="h-4 w-4 text-fleet-gold" />
            <span>Website</span>
          </Link>
        </motion.section>

        <HubPromotionCarousel slides={promotionSlides} />

        <section className="mt-5 rounded-[16px] bg-white p-3 shadow-[0_8px_22px_rgba(8,17,31,0.06)] sm:mt-6 sm:p-4" aria-labelledby="quick-actions-title">
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
                  <Link href={action.href} className="group grid min-h-[104px] place-items-center gap-2 rounded-fleet px-1 py-1.5 text-center transition hover:bg-[#f6f8fa] focus:outline-none focus:ring-4 focus:ring-fleet-gold/20">
                    <span className={`grid h-14 w-14 place-items-center rounded-[16px] transition duration-200 group-hover:scale-105 ${toneClasses[action.tone]}`}>
                      <Icon className="h-6 w-6" strokeWidth={2.2} />
                    </span>
                    <span className="flex min-h-8 items-center justify-center text-[0.75rem] font-black leading-4 text-fleet-night">{action.title}</span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>

        {shortcuts.length ? (
          <section className="mt-7" aria-labelledby="quick-shortcuts-title">
            <h2 id="quick-shortcuts-title" className="text-lg font-black text-fleet-night">Quick Shortcuts</h2>
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1">
              {shortcuts.map((shortcut) => {
                const Icon = shortcut.icon;
                return (
                  <Link key={shortcut.title} href={shortcut.href} className="flex min-h-14 min-w-[164px] items-center gap-3 rounded-fleet bg-white px-3 text-sm font-black text-fleet-night shadow-[0_6px_18px_rgba(8,17,31,0.06)] transition hover:-translate-y-0.5 hover:text-fleet-ember focus:outline-none focus:ring-4 focus:ring-fleet-gold/20">
                    <Icon className="h-5 w-5 shrink-0 text-fleet-navy" />
                    <span className="min-w-0 flex-1 whitespace-nowrap">{shortcut.title}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="mt-7 overflow-hidden rounded-[18px] bg-[linear-gradient(120deg,#0b1d3a,#0f3460)] p-5 text-white shadow-[0_12px_28px_rgba(8,17,31,0.14)] sm:p-6" aria-labelledby="glance-title">
          <div className="flex items-center justify-between gap-4">
            <h2 id="glance-title" className="text-lg font-black">{glance.title}</h2>
            <Link href={glance.href} className="inline-flex items-center gap-1 text-sm font-black text-[#53a4ff] transition hover:text-white">View all <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {glance.items.map((item) => (
              <div key={item.label} className="min-w-0">
                <span className="block text-xs font-bold text-white/65">{item.label}</span>
                <strong className="mt-2 block truncate text-xl font-black sm:text-2xl">{item.value}</strong>
                <span className="mt-1 block text-xs font-semibold text-white/65">{item.helper}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
