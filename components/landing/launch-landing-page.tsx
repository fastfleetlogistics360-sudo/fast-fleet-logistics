"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bike, CircleUserRound, LayoutDashboard, LogIn, Play, Store, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { readReturningProfile, saveReturningProfile } from "@/lib/auth/returning-profile";

type ActionItemConfig = {
  title: string;
  body: string;
  icon: LucideIcon;
  href: string;
};

const actionItems: ActionItemConfig[] = [
  {
    title: "Sign up",
    body: "Create your account",
    icon: UserPlus,
    href: "/auth?mode=signup&returnTo=/hub"
  },
  {
    title: "Sign in",
    body: "Access your dashboard",
    icon: LogIn,
    href: "/auth?mode=login&returnTo=/hub"
  },
  {
    title: "Become a rider",
    body: "Apply to join the rider network",
    icon: Bike,
    href: "/auth?account=driver&mode=signup&returnTo=/hub"
  },
  {
    title: "Register a business",
    body: "Set up business delivery tools",
    icon: Store,
    href: "/auth?account=business&mode=signup&returnTo=/hub"
  }
];

const heroBackgroundImage = "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=1500&q=70";
const heroBlurDataURL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nOScgdmlld0JveD0nMCAwIDE2IDknIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzknIGZpbGw9JyMwMjA2MDgnLz48Y2lyY2xlIGN4PScxMicgY3k9JzInIHI9JzUnIGZpbGw9JyNlZjZjMDAnIG9wYWNpdHk9Jy4yOCcvPjxjaXJjbGUgY3g9JzQnIGN5PSc3JyByPSc0JyBmaWxsPScjMGYzNDYwJyBvcGFjaXR5PScuNDgnLz48L3N2Zz4=";
const brandLogo = "/brand/fastfleet-logo-2026-header.png?v=20260717";
const partnerLogos = [
  { src: "/brand-partners/startsmart-africa-transparent.webp", alt: "StartSmart Africa" },
  { src: "/brand-partners/partner-mark-v7-transparent.webp", alt: "Brand partner mark" },
  { src: "/brand-partners/vision-adonai-transparent.webp", alt: "Vision-Adonai Ventures" },
  { src: "/brand-partners/nectar-greens-transparent.webp", alt: "Brand partner logo" }
];

function isInstalledApp() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export function LaunchLandingPage() {
  const [hasActiveSession, setHasActiveSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const launchedAsInstalledApp = isInstalledApp();

    import("@/lib/supabase/client")
      .then(({ createClient }) => createClient().auth.getUser())
      .then(({ data }) => {
        if (cancelled) return;
        if (data.user) {
          setHasActiveSession(true);
          saveReturningProfile({
            fullName: data.user.user_metadata?.full_name || data.user.user_metadata?.name || null,
            email: data.user.email || null
          });
          if (launchedAsInstalledApp) window.location.replace("/hub");
          return;
        }

        if (launchedAsInstalledApp && readReturningProfile()) {
          window.location.replace("/auth?mode=login&returnTo=/hub");
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#020608] text-white">
      <Image
        src={heroBackgroundImage}
        alt=""
        fill
        priority
        quality={70}
        placeholder="blur"
        blurDataURL={heroBlurDataURL}
        sizes="100vw"
        className="absolute inset-0 object-cover object-center"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_34%,rgba(244,126,24,0.16),transparent_30%),linear-gradient(90deg,rgba(2,6,8,0.94),rgba(2,6,8,0.70)_45%,rgba(2,6,8,0.35)),linear-gradient(180deg,rgba(2,6,8,0.22),rgba(2,6,8,0.98)_74%,#020608)]" />

      <section className="section-wrap relative z-10 flex min-h-screen flex-col px-4 pb-7 pt-5 sm:px-6 lg:pb-9 lg:pt-6">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="group flex min-w-0 items-center gap-3" aria-label="Fast Fleets 360 landing home">
            <Image
              src={brandLogo}
              alt="Fast Fleets 360 Logistics"
              width={56}
              height={56}
              className="h-10 w-10 rounded-full border border-white/20 bg-white object-contain p-1 shadow-[0_14px_30px_rgba(0,0,0,0.24)] transition group-hover:-translate-y-0.5"
              priority
              sizes="56px"
            />
            <span className="grid leading-none">
              <strong className="text-base font-black italic tracking-[0.02em] text-white sm:text-xl">Fast Fleets 360</strong>
              <span className="mt-1 text-[0.56rem] font-black uppercase tracking-[0.34em] text-fleet-gold sm:text-[0.6rem]">Logistics</span>
            </span>
          </Link>

          {hasActiveSession ? (
            <Link href="/hub" className="inline-flex min-h-10 items-center gap-2 rounded-[14px] border border-white/20 bg-white/10 px-3.5 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white hover:text-fleet-night focus:outline-none focus:ring-4 focus:ring-white/20">
              <LayoutDashboard className="h-4 w-4" />
              Open dashboard
            </Link>
          ) : null}
        </header>

        <div className="grid flex-1 content-center py-10 sm:py-12 lg:py-14">
          <div className="max-w-3xl">
            <p className="text-sm font-extrabold text-fleet-gold sm:text-base">Fast. Reliable. Always.</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[0.98] tracking-normal text-white sm:text-6xl lg:text-7xl">
              Delivering more, every day.
            </h1>
            <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-white/[0.85] sm:text-lg">
              Fast Fleets 360 connects people and businesses through safe, visible, and reliable delivery.
            </p>

            <div
              id="launch-actions"
              className="mt-6 rounded-[20px] border border-white/[0.15] bg-black/[0.36] p-2.5 shadow-[0_18px_52px_rgba(0,0,0,0.30)] backdrop-blur-2xl"
            >
              <div className="grid grid-cols-2 gap-2">
                {actionItems.map((item) => (
                  <ActionItem key={item.title} item={item} />
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/main"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-fleet-ember px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(239,108,0,0.24)] transition hover:-translate-y-0.5 hover:bg-[#f47e18] focus:outline-none focus:ring-4 focus:ring-fleet-gold/25"
              >
                <CircleUserRound className="h-4 w-4" />
                Explore services
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-black text-white transition hover:-translate-y-0.5 hover:text-fleet-gold focus:outline-none focus:ring-4 focus:ring-white/[0.15]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full border border-white/70 bg-white/5 backdrop-blur">
                  <Play className="h-4 w-4 fill-white text-white" />
                </span>
                How It Works
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-white/[0.58]">Trusted collaborations</p>
            <h2 className="mt-2 text-lg font-black uppercase tracking-[0.04em] text-white sm:text-xl">OUR BRAND PARTNERS</h2>
          </div>
          <div className="mt-8 grid grid-cols-2 items-center gap-x-6 gap-y-8 sm:grid-cols-4 sm:gap-x-10 lg:gap-x-14">
            {partnerLogos.map((partner) => (
              <div key={partner.src} className="relative h-28 sm:h-32 lg:h-36">
                <Image src={partner.src} alt={partner.alt} fill sizes="(min-width: 1024px) 210px, (min-width: 640px) 22vw, 40vw" className="object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.34)]" />
              </div>
            ))}
          </div>
          <footer className="pt-14 text-center text-sm font-semibold text-white/[0.72]">© 2026 Fast Fleets 360. All rights reserved.</footer>
        </div>
      </section>
    </main>
  );
}

function ActionItem({
  item
}: {
  item: ActionItemConfig;
}) {
  const Icon = item.icon;
  const content = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fleet-ember/20 text-fleet-gold shadow-[0_0_22px_rgba(239,108,0,0.14)] sm:h-10 sm:w-10">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-black leading-tight text-white">{item.title}</strong>
        <span className="mt-1 block text-[0.7rem] font-semibold leading-5 text-white/[0.72]">{item.body}</span>
      </span>
    </>
  );
  const classes =
    "group relative flex min-h-[82px] items-center gap-2.5 rounded-[16px] border border-white/10 bg-white/[0.045] p-2.5 text-left transition hover:-translate-y-0.5 hover:border-fleet-gold/30 hover:bg-white/[0.08] focus:outline-none focus:ring-4 focus:ring-fleet-gold/20";

  return (
    <Link href={item.href} className={classes}>
      {content}
    </Link>
  );
}
