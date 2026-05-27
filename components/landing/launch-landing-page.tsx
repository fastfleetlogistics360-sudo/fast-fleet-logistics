"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Bike, CircleUserRound, LogIn, Play, Store, UserPlus, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppleIcon, GoogleIcon, InstagramIcon, LinkedinIcon, TikTokIcon, XIcon } from "@/components/icons/social-icons";

const PhoneAuthForm = dynamic(() => import("@/components/auth/phone-auth-form").then((mod) => mod.PhoneAuthForm), {
  ssr: false,
  loading: () => <div className="min-h-64 animate-pulse rounded-fleet bg-white/75" />
});

type AuthIntent = "signup" | "login";
type ActionItemConfig =
  | {
      title: string;
      body: string;
      icon: LucideIcon;
      action: AuthIntent;
      href?: never;
    }
  | {
      title: string;
      body: string;
      icon: LucideIcon;
      href: string;
      action?: never;
    };

const actionItems: ActionItemConfig[] = [
  {
    title: "Sign Up",
    body: "Create an account in minutes",
    icon: UserPlus,
    action: "signup" as const
  },
  {
    title: "Sign In",
    body: "Access your account seamlessly",
    icon: LogIn,
    action: "login" as const
  },
  {
    title: "Register as a Driver",
    body: "Join our network and start earning",
    icon: Bike,
    href: "/auth?account=driver"
  },
  {
    title: "Register Your Business",
    body: "Grow your business with Fast Fleets 360",
    icon: Store,
    href: "/auth?account=business"
  }
];

const socialItems = [
  { label: "Instagram", href: "https://www.instagram.com/fastfleets360", icon: InstagramIcon },
  { label: "X", href: "https://x.com/fastfleets360", icon: XIcon },
  { label: "TikTok", href: "https://www.tiktok.com/@fastfleets360", icon: TikTokIcon },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/fast-fleets-logistics-3a3094412?utm_source=share_via&utm_content=profile&utm_medium=member_ios", icon: LinkedinIcon }
];

const partners = [
  {
    name: "FreshMart",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=500&q=78"
  },
  {
    name: "SwiftFoods",
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=500&q=78"
  },
  {
    name: "MediLink",
    image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=500&q=78"
  },
  {
    name: "City Bites",
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=500&q=78"
  },
  {
    name: "ParcelPro",
    image: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=500&q=78"
  },
  {
    name: "MarketHub",
    image: "https://images.unsplash.com/photo-1515706886582-54c73c5eaf41?auto=format&fit=crop&w=500&q=78"
  },
  {
    name: "Shop Lagos",
    image: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=500&q=78"
  },
  {
    name: "QuickSend",
    image: "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=500&q=78"
  }
];

const heroBackgroundImage = "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=1500&q=70";
const heroBlurDataURL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nOScgdmlld0JveD0nMCAwIDE2IDknIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzknIGZpbGw9JyMwMjA2MDgnLz48Y2lyY2xlIGN4PScxMicgY3k9JzInIHI9JzUnIGZpbGw9JyNlZjZjMDAnIG9wYWNpdHk9Jy4yOCcvPjxjaXJjbGUgY3g9JzQnIGN5PSc3JyByPSc0JyBmaWxsPScjMGYzNDYwJyBvcGFjaXR5PScuNDgnLz48L3N2Zz4=";
const brandLogo = "/brand/fastfleet-logo-2026.png";

export function LaunchLandingPage() {
  const [authIntent, setAuthIntent] = useState<AuthIntent | null>(null);
  const [storePopup, setStorePopup] = useState(false);
  const reduceMotion = useReducedMotion();
  const partnerLoop = [...partners, ...partners];

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

      <section className="section-wrap relative z-10 flex min-h-screen flex-col px-4 pb-8 pt-6 sm:px-6 lg:pb-10 lg:pt-7">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="group flex min-w-0 items-center gap-3" aria-label="Fast Fleets 360 landing home">
            <Image
              src={brandLogo}
              alt="Fast Fleets 360 Logistics"
              width={56}
              height={56}
              className="h-11 w-11 rounded-full border border-white/20 bg-white object-cover p-1 shadow-[0_16px_34px_rgba(0,0,0,0.28)] transition group-hover:-translate-y-0.5"
              priority
              sizes="56px"
            />
            <span className="grid leading-none">
              <strong className="text-lg font-black italic tracking-[0.02em] text-white sm:text-2xl">Fast Fleets 360</strong>
              <span className="mt-1 text-[0.58rem] font-black uppercase tracking-[0.42em] text-fleet-gold sm:text-[0.64rem]">Logistics</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-4" aria-label="Landing account actions">
            <button
              type="button"
              onClick={() => setAuthIntent("login")}
              className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-white/70 bg-white/5 px-4 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white hover:text-fleet-night focus:outline-none focus:ring-4 focus:ring-white/20 sm:min-h-14 sm:px-8 sm:text-base"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setAuthIntent("signup")}
              className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-fleet-ember bg-fleet-ember px-4 text-sm font-black text-white shadow-[0_0_32px_rgba(239,108,0,0.34)] transition hover:-translate-y-0.5 hover:bg-[#f47e18] focus:outline-none focus:ring-4 focus:ring-fleet-gold/25 sm:min-h-14 sm:px-8 sm:text-base"
            >
              Sign Up
            </button>
          </nav>
        </header>

        <div className="grid flex-1 content-center py-14 sm:py-16 lg:py-20">
          <motion.div
            className="max-w-3xl"
            initial={reduceMotion ? false : { opacity: 0, y: 28 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-base font-extrabold text-fleet-gold sm:text-xl">Fast. Reliable. Always.</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[0.98] tracking-normal text-white sm:text-7xl lg:text-8xl">
              Delivering More, Everyday.
            </h1>
            <p className="mt-6 max-w-2xl text-base font-semibold leading-8 text-white/85 sm:text-xl">
              Fast Fleets 360 connects people, businesses and communities through fast, safe and reliable delivery.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/main"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-fleet bg-fleet-ember px-7 text-base font-black text-white shadow-[0_0_38px_rgba(239,108,0,0.35)] transition hover:-translate-y-0.5 hover:bg-[#f47e18] focus:outline-none focus:ring-4 focus:ring-fleet-gold/25"
              >
                <CircleUserRound className="h-5 w-5" />
                Proceed to Main Page
              </Link>
              <Link
                href="#launch-actions"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full text-base font-black text-white transition hover:-translate-y-0.5 hover:text-fleet-gold focus:outline-none focus:ring-4 focus:ring-white/15"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full border border-white/80 bg-white/5 backdrop-blur">
                  <Play className="h-5 w-5 fill-white text-white" />
                </span>
                How It Works
              </Link>
            </div>
          </motion.div>
        </div>

        <motion.div
          id="launch-actions"
          className="rounded-[18px] border border-white/15 bg-black/40 p-2.5 shadow-[0_18px_52px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:p-3"
          initial={reduceMotion ? false : { opacity: 0, y: 34 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {actionItems.map((item, index) => (
              <ActionItem key={item.title} item={item} index={index} onAuth={setAuthIntent} />
            ))}
          </div>
        </motion.div>

        <div className="mx-auto mt-9 grid justify-items-center gap-7">
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

      <section className="relative z-10 bg-black/84 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-7xl overflow-hidden">
          <h2 className="text-center text-sm font-black uppercase tracking-normal text-fleet-gold">OUR BRAND PARTNERS</h2>
          <div className="relative mt-5 overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
            <div className="partner-marquee flex w-max gap-3">
              {partnerLoop.map((partner, index) => (
                <div key={`${partner.name}-${index}`} className="relative h-24 w-40 shrink-0 overflow-hidden rounded-[10px] bg-white shadow-[0_16px_34px_rgba(0,0,0,0.28)] sm:h-28 sm:w-48">
                  <Image src={partner.image} alt="" fill className="object-cover" sizes="(min-width: 640px) 192px, 160px" quality={58} loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-fleet-night/80 via-fleet-night/10 to-white/10" />
                  <span className="absolute inset-x-2 bottom-2 rounded-md bg-white/92 px-2 py-1 text-center text-sm font-black text-fleet-night shadow-[0_8px_18px_rgba(0,0,0,0.16)]">
                    {partner.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <footer className="pt-14 text-center text-sm font-semibold text-white/[0.72]">© 2025 Fast Fleets 360. All rights reserved.</footer>
        </div>
      </section>

      {authIntent ? <AuthModal intent={authIntent} onClose={() => setAuthIntent(null)} /> : null}
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

function ActionItem({
  item,
  index,
  onAuth
}: {
  item: ActionItemConfig;
  index: number;
  onAuth: (intent: AuthIntent) => void;
}) {
  const Icon = item.icon;
  const content = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fleet-ember/20 text-fleet-gold shadow-[0_0_22px_rgba(239,108,0,0.16)] sm:h-11 sm:w-11">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-black leading-tight text-white sm:text-base">{item.title}</strong>
        <span className="mt-1 block text-[0.72rem] font-semibold leading-5 text-white/[0.72] sm:text-xs">{item.body}</span>
      </span>
    </>
  );
  const classes =
    "group relative flex min-h-[96px] items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.035] p-3 text-left transition hover:-translate-y-0.5 hover:border-fleet-gold/30 hover:bg-white/[0.08] focus:outline-none focus:ring-4 focus:ring-fleet-gold/20 sm:min-h-[104px] md:border-0 md:bg-transparent";

  if (item.href) {
    return (
      <Link href={item.href} className={classes}>
        {index > 0 ? <span className="absolute bottom-6 left-0 top-6 hidden w-px bg-white/16 md:block" /> : null}
        {content}
      </Link>
    );
  }

  const authAction = item.action;
  if (!authAction) return null;

  return (
    <button type="button" onClick={() => onAuth(authAction)} className={classes}>
      {index > 0 ? <span className="absolute bottom-6 left-0 top-6 hidden w-px bg-white/16 md:block" /> : null}
      {content}
    </button>
  );
}

function StoreBadge({ icon, eyebrow, label, onClick }: { icon: ReactNode; eyebrow: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-16 min-w-[230px] items-center justify-center gap-3 rounded-[10px] border border-white/70 bg-black px-5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.26)] transition hover:-translate-y-0.5 hover:border-fleet-gold focus:outline-none focus:ring-4 focus:ring-fleet-gold/20"
    >
      {icon}
      <span className="grid text-left leading-none">
        <span className="text-[0.68rem] font-black uppercase tracking-normal text-white/80">{eyebrow}</span>
        <strong className="mt-1 text-2xl font-black">{label}</strong>
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

function AuthModal({ intent, onClose }: { intent: AuthIntent; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const title = intent === "signup" ? "Create your Fast Fleets 360 account" : "Sign in to Fast Fleets 360";
  const description =
    intent === "signup"
      ? "Sign up with email, choose your access type, and continue into Fast Fleets 360."
      : "Enter your email and password to return to your delivery workspace.";

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[160] grid place-items-center bg-fleet-night/70 px-3 py-8 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        className="relative max-h-[58vh] w-[calc(100vw-28px)] max-w-[560px] overflow-hidden rounded-[28px] border border-fleet-gold/40 bg-[#fffdf4] shadow-[0_28px_90px_rgba(0,0,0,0.38)] sm:max-h-[680px]"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-grid h-11 w-11 place-items-center rounded-full border border-fleet-line bg-white text-fleet-night shadow-lift transition hover:-translate-y-0.5"
          aria-label="Close auth card"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="max-h-[58vh] overflow-y-auto px-5 pb-5 pt-6 sm:max-h-[680px] sm:px-7 sm:pb-7">
          <Suspense fallback={<div className="min-h-64 animate-pulse rounded-fleet bg-white/70" />}>
            <PhoneAuthForm surface="plain" title={title} description={description} intent={intent} />
          </Suspense>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
