"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BellRing, BookOpenText, BriefcaseBusiness, CircleHelp, Compass, Headphones, LayoutDashboard, MapPinned, PackageCheck, ShoppingBag, Sparkles, Store, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/types/domain";
import { roleHome } from "@/lib/auth/roles";
import { saveReturningProfile } from "@/lib/auth/returning-profile";

type HubAction = {
  title: string;
  body: string;
  href: string;
  icon: LucideIcon;
  tone: "orange" | "blue" | "green" | "gold";
  featured?: boolean;
};

function firstName(fullName: string | null, email: string | null) {
  const label = fullName || email?.split("@")[0] || "there";
  return label.trim().split(/\s+/)[0] || "there";
}

export function QuickActionHub({ role, fullName, email }: { role: UserRole; fullName: string | null; email: string | null }) {
  const reduceMotion = useReducedMotion();
  const name = firstName(fullName, email);

  useEffect(() => {
    saveReturningProfile({ fullName: fullName || name, email });
  }, [email, fullName, name]);

  const actions: HubAction[] = [
    {
      title: "Dashboard",
      body: "Open your workspace",
      href: roleHome[role],
      icon: LayoutDashboard,
      tone: "blue"
    },
    {
      title: "Marketplace",
      body: "Shop local partners",
      href: "/shopping-mall",
      icon: ShoppingBag,
      tone: "green"
    },
    {
      title: "Book a Delivery",
      body: "Send a package in a few steps",
      href: "/book",
      icon: Truck,
      tone: "orange",
      featured: true
    },
    {
      title: "Track a Delivery",
      body: "See live order progress",
      href: "/track",
      icon: MapPinned,
      tone: "gold"
    },
    {
      title: "Contact Support",
      body: "Get help with your account",
      href: "/support",
      icon: Headphones,
      tone: "blue"
    },
    {
      title: "Explore Services",
      body: "See everything Fast Fleets offers",
      href: "/services",
      icon: Compass,
      tone: "green"
    },
    {
      title: "Promotions & Updates",
      body: "Launch news and opportunities",
      href: "/updates",
      icon: BellRing,
      tone: "orange"
    },
    {
      title: "About Fast Fleets 360",
      body: "Our mission, FAQs, and policies",
      href: "/about",
      icon: BookOpenText,
      tone: "gold"
    }
  ];

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-[#f4f7fb] pb-24 text-fleet-night lg:pb-10">
      <section className="relative overflow-hidden bg-fleet-night text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_0%,rgba(244,166,42,0.18),transparent_30%),linear-gradient(135deg,rgba(15,52,96,0.9),rgba(8,17,31,1)_62%)]" />
        <div className="section-wrap relative px-4 py-7 sm:px-6 sm:py-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Image src="/brand/fastfleet-logo-2026-header.png" alt="Fast Fleets 360" width={50} height={50} className="h-12 w-12 rounded-fleet border border-white/15 bg-white object-cover p-1" priority />
              <span className="grid min-w-0 leading-none">
                <strong className="truncate text-base font-black sm:text-lg">Fast Fleets 360</strong>
                <span className="mt-1 text-[0.62rem] font-black uppercase tracking-[0.18em] text-fleet-gold">Your app hub</span>
              </span>
            </div>
            <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-fleet border border-white/15 bg-white/10 px-3 text-xs font-black text-white transition hover:bg-white/15">
              <Store className="h-4 w-4 text-fleet-gold" />
              Website
            </Link>
          </div>

          <div className="mt-10 max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-fleet-gold/25 bg-fleet-gold/10 px-3 py-1.5 text-[0.66rem] font-black uppercase tracking-[0.14em] text-fleet-gold">
              <Sparkles className="h-3.5 w-3.5" />
              {role} account
            </span>
            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">Good to see you, {name}.</h1>
            <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-white/72 sm:text-base">Choose where you would like to go. Your dashboard keeps its own role and verification checks.</p>
          </div>
        </div>
      </section>

      <section className="section-wrap px-4 py-6 sm:px-6 sm:py-9">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Quick actions</span>
            <h2 className="mt-1 text-2xl font-black text-fleet-night sm:text-3xl">What do you need today?</h2>
          </div>
          <PackageCheck className="h-8 w-8 text-fleet-ember" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {actions.map((action, index) => {
            const Icon = action.icon;
            const toneClass = {
              orange: "bg-fleet-ember text-white shadow-[0_14px_28px_rgba(239,108,0,0.22)]",
              blue: "bg-fleet-navy text-white shadow-[0_14px_28px_rgba(15,52,96,0.18)]",
              green: "bg-fleet-leaf text-white shadow-[0_14px_28px_rgba(21,163,107,0.18)]",
              gold: "bg-fleet-gold text-fleet-night shadow-[0_14px_28px_rgba(244,166,42,0.2)]"
            }[action.tone];

            return (
              <motion.div
                key={action.title}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.045, ease: [0.22, 1, 0.36, 1] }}
                className={action.featured ? "col-span-2" : ""}
              >
                <Link
                  href={action.href}
                  className={`group flex min-h-[154px] h-full flex-col justify-between overflow-hidden rounded-fleet border border-fleet-line bg-white p-4 shadow-[0_10px_28px_rgba(8,17,31,0.07)] transition hover:-translate-y-1 hover:border-fleet-gold/60 hover:shadow-[0_18px_38px_rgba(8,17,31,0.14)] focus:outline-none focus:ring-4 focus:ring-fleet-gold/20 sm:min-h-[170px] ${action.featured ? "sm:flex-row sm:items-center sm:gap-6 sm:p-5" : ""}`}
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-fleet transition duration-300 group-hover:scale-110 group-hover:rotate-3 ${toneClass}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className={action.featured ? "min-w-0 sm:flex-1" : "min-w-0"}>
                    <strong className="block text-sm font-black leading-tight text-fleet-night sm:text-base">{action.title}</strong>
                    <span className="mt-1.5 block text-xs font-semibold leading-5 text-slate-500">{action.body}</span>
                  </span>
                  {action.featured ? <BriefcaseBusiness className="hidden h-9 w-9 text-fleet-ember/25 sm:block" aria-hidden="true" /> : null}
                </Link>
              </motion.div>
            );
          })}
        </div>

        <Link href="/support" className="mt-6 flex items-center gap-3 rounded-fleet border border-fleet-line bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:border-fleet-gold hover:text-fleet-night">
          <CircleHelp className="h-5 w-5 shrink-0 text-fleet-ember" />
          Need a hand? Our support team is ready to help.
        </Link>
      </section>
    </main>
  );
}
