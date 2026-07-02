"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Bike, CalendarDays, CheckCircle2, CircleUserRound, LayoutDashboard, LogIn, MapPinned, Play, Rocket, Store, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppleIcon, GoogleIcon, InstagramIcon, TikTokIcon, XIcon } from "@/components/icons/social-icons";
import { readReturningProfile, saveReturningProfile } from "@/lib/auth/returning-profile";
import { defaultBrandPartners, type BrandPartner } from "@/lib/brand-partners";

type ActionItemConfig = {
  title: string;
  body: string;
  icon: LucideIcon;
  href: string;
};

const actionItems: ActionItemConfig[] = [
  {
    title: "Sign Up",
    body: "Create an account in minutes",
    icon: UserPlus,
    href: "/auth?mode=signup&returnTo=/hub"
  },
  {
    title: "Sign In",
    body: "Access your account seamlessly",
    icon: LogIn,
    href: "/auth?mode=login&returnTo=/hub"
  },
  {
    title: "Register as a Driver",
    body: "Join our network and start earning",
    icon: Bike,
    href: "/auth?account=driver&mode=signup&returnTo=/hub"
  },
  {
    title: "Register Your Business",
    body: "Grow your business with Fast Fleets 360",
    icon: Store,
    href: "/auth?account=business&mode=signup&returnTo=/hub"
  }
];

const socialItems = [
  { label: "Instagram", href: "https://www.instagram.com/fastfleets360", icon: InstagramIcon },
  { label: "X", href: "https://x.com/fastfleets360", icon: XIcon },
  { label: "TikTok", href: "https://www.tiktok.com/@fastfleets360", icon: TikTokIcon }
];

const heroBackgroundImage = "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=1500&q=70";
const heroBlurDataURL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nOScgdmlld0JveD0nMCAwIDE2IDknIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzknIGZpbGw9JyMwMjA2MDgnLz48Y2lyY2xlIGN4PScxMicgY3k9JzInIHI9JzUnIGZpbGw9JyNlZjZjMDAnIG9wYWNpdHk9Jy4yOCcvPjxjaXJjbGUgY3g9JzQnIGN5PSc3JyByPSc0JyBmaWxsPScjMGYzNDYwJyBvcGFjaXR5PScuNDgnLz48L3N2Zz4=";
const brandLogo = "/brand/fastfleet-logo-2026.png?v=20260629";

const softLaunchStates = [
  { state: "Lagos State" },
  { state: "Ogun State" },
  { state: "Kwara State" }
];

function isInstalledApp() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export function LaunchLandingPage({ initialPartners = defaultBrandPartners }: { initialPartners?: BrandPartner[] }) {
  const [storePopup, setStorePopup] = useState(false);
  const [partners, setPartners] = useState<BrandPartner[]>(initialPartners);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const reduceMotion = useReducedMotion();
  const activePartners = partners.filter((partner) => partner.active);
  const partnerLoop = [...activePartners, ...activePartners];

  useEffect(() => {
    setPartners(initialPartners);
  }, [initialPartners]);

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
              Open App
            </Link>
          ) : null}
        </header>

        <div className="grid flex-1 content-center py-10 sm:py-12 lg:py-14">
          <div className="max-w-3xl">
            <p className="text-sm font-extrabold text-fleet-gold sm:text-base">Fast. Reliable. Always.</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[0.98] tracking-normal text-white sm:text-6xl lg:text-7xl">
              Delivering More, Everyday.
            </h1>
            <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-white/[0.85] sm:text-lg">
              Fast Fleets 360 connects people, businesses and communities through fast, safe and reliable delivery.
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
                Proceed to Main Page
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

          <LaunchStatusPanels reduceMotion={Boolean(reduceMotion)} />
        </div>
        <div className="mx-auto mt-8 grid justify-items-center gap-6">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <StoreBadge icon={<AppleIcon className="h-8 w-8" />} eyebrow="Download on the" label="App Store" onClick={() => setStorePopup(true)} />
            <StoreBadge icon={<GoogleIcon className="h-8 w-8" />} eyebrow="GET IT ON" label="Google Play" onClick={() => setStorePopup(true)} />
          </div>
          <div className="grid justify-items-center gap-4">
            <span className="text-xl font-semibold text-white">Follow us</span>
            <div className="flex flex-wrap justify-center gap-4">
              {socialItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-label={item.label}
                    className="grid h-14 w-14 place-items-center rounded-full border border-white/80 bg-white/[0.03] text-white transition hover:-translate-y-1 hover:border-fleet-ember hover:bg-fleet-ember hover:text-white"
                  >
                    <Icon className="h-6 w-6" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 bg-black/[0.84] px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-7xl overflow-hidden">
          <h2 className="text-center text-sm font-black uppercase tracking-normal text-fleet-gold">OUR BRAND PARTNERS</h2>
          <div className="relative mt-5 overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
            <div className="partner-marquee flex w-max gap-3">
              {partnerLoop.map((partner, index) => (
                <div
                  key={`${partner.id || partner.image}-${index}`}
                  className="relative h-24 shrink-0 overflow-hidden rounded-[10px] bg-white shadow-[0_16px_34px_rgba(0,0,0,0.28)] sm:h-28"
                  style={{ width: "clamp(9rem, 42vw, 12rem)" }}
                >
                  <img src={partner.image} alt="" loading="lazy" style={{ display: "block", height: "100%", width: "100%", objectFit: "cover" }} />
                  {partner.name.trim() ? (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-t from-fleet-night/80 via-fleet-night/10 to-white/10" />
                      <span className="absolute inset-x-2 bottom-2 rounded-md bg-white/[0.92] px-2 py-1 text-center text-sm font-black text-fleet-night shadow-[0_8px_18px_rgba(0,0,0,0.16)]">
                        {partner.name}
                      </span>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <footer className="pt-14 text-center text-sm font-semibold text-white/[0.72]">© 2026 Fast Fleets 360. All rights reserved.</footer>
        </div>
      </section>

      {storePopup ? <ComingSoonModal onClose={() => setStorePopup(false)} /> : null}
      <style jsx global>{`
        @keyframes fastfleet-partner-marquee {
          from {
            transform: translateX(-50%);
          }
          to {
            transform: translateX(0);
          }
        }

        .partner-marquee {
          will-change: transform;
          animation: fastfleet-partner-marquee 28s linear infinite;
        }

        .partner-marquee:hover {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          .partner-marquee {
            animation: none;
            transform: translateX(0);
          }

        }
      `}</style>
    </main>
  );
}

function LaunchStatusPanels({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section className="mt-7 grid max-w-4xl gap-3 sm:grid-cols-2" aria-label="Launch and marketplace availability">
      <motion.article
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-[18px] border border-white/[0.15] bg-white/[0.09] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-fleet-gold"><Rocket className="h-4 w-4" /> Launch Status</span>
          <CalendarDays className="h-4 w-4 text-fleet-ember" />
        </div>
        <strong className="mt-3 block text-lg font-black text-white">Soft Launch Scheduled</strong>
        <span className="mt-1 block text-sm font-black text-fleet-gold">August 2026</span>
        <div className="mt-4 flex flex-wrap gap-2">
          {softLaunchStates.map((item) => <span key={item.state} className="rounded-full border border-white/[0.12] bg-black/[0.15] px-2.5 py-1 text-[0.68rem] font-bold text-white/80">{item.state}</span>)}
        </div>
        <Link href="/updates#launch" className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:text-fleet-gold">Learn More <ArrowUpRight className="h-4 w-4" /></Link>
      </motion.article>

      <motion.article
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.07, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-[18px] border border-white/[0.15] bg-[#07131f]/95 p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.22)]"
      >
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-fleet-gold"><Store className="h-4 w-4" /> Marketplace Onboarding</div>
        <strong className="mt-3 block text-lg font-black text-white">2 Partners Onboarded</strong>
        <div className="mt-3 grid gap-1 text-xs font-bold text-fleet-mint"><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Nectar &amp; Greens</span><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> FarmFresh by V-A.V</span></div>
        <div className="mt-4 flex items-end justify-between gap-3"><span className="text-sm font-black text-white">28 Marketplace Slots Available</span><span className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-white/60">2 / 30 Filled</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-[6.67%] rounded-full bg-fleet-leaf" /></div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[0.68rem] font-bold text-white/[0.65]"><span>Onboarding ends: Aug 10, 2026</span><Link href="/business/register" className="text-fleet-gold transition hover:text-white">Reserve Your Slot</Link></div>
      </motion.article>
    </section>
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

function StoreBadge({ icon, eyebrow, label, onClick }: { icon: ReactNode; eyebrow: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-14 min-w-[205px] items-center justify-center gap-3 rounded-[12px] border border-white/70 bg-black px-4 text-white shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:border-fleet-gold focus:outline-none focus:ring-4 focus:ring-fleet-gold/20"
    >
      {icon}
      <span className="grid text-left leading-none">
        <span className="text-[0.68rem] font-black uppercase tracking-normal text-white/80">{eyebrow}</span>
        <strong className="mt-1 text-xl font-black">{label}</strong>
      </span>
    </button>
  );
}

function ComingSoonModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-black/60 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Fast Fleets 360 app release access">
      <motion.div
        className="w-full max-w-sm rounded-[18px] border border-white/15 bg-white p-6 text-center text-fleet-night shadow-[0_28px_90px_rgba(0,0,0,0.35)]"
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <strong className="block text-2xl font-black">Release access underway</strong>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Fast Fleets 360 mobile app access is being rolled out in controlled phases.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-fleet bg-fleet-ember px-4 text-sm font-black text-white transition hover:bg-[#f47e18] focus:outline-none focus:ring-4 focus:ring-fleet-gold/25"
        >
          Okay
        </button>
      </motion.div>
    </div>
  );
}
