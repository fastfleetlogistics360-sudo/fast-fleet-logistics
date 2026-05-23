"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Bike, ChevronLeft, ChevronRight, CircleUserRound, LogIn, Play, Store, UserPlus, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { AppleIcon, FacebookIcon, GoogleIcon, InstagramIcon, LinkedinIcon, XIcon } from "@/components/icons/social-icons";

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
    body: "Grow your business with FastFleet",
    icon: Store,
    href: "/auth?account=business"
  }
];

const socialItems = [
  { label: "Facebook", href: "https://www.facebook.com/fastfleetlogistics", icon: FacebookIcon },
  { label: "Instagram", href: "https://www.instagram.com/fastfleetlogistics", icon: InstagramIcon },
  { label: "X", href: "https://x.com/fastfleetng", icon: XIcon },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/fastfleet-logistics", icon: LinkedinIcon },
  { label: "TikTok", href: "#", icon: TikTokIcon }
];

const partners = ["FreshMart", "SwiftFoods", "MediLink", "City Bites", "ParcelPro", "MarketHub", "Shop Lagos", "QuickSend"];

export function LaunchLandingPage() {
  const [authIntent, setAuthIntent] = useState<AuthIntent | null>(null);
  const [partnerOffset, setPartnerOffset] = useState(0);
  const reduceMotion = useReducedMotion();
  const visiblePartners = useMemo(() => {
    return [...partners, ...partners].slice(partnerOffset, partnerOffset + 6);
  }, [partnerOffset]);

  function movePartners(direction: number) {
    setPartnerOffset((value) => (value + direction + partners.length) % partners.length);
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#020608] text-white">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=2200&q=88')"
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_34%,rgba(94,214,16,0.12),transparent_30%),linear-gradient(90deg,rgba(2,6,8,0.94),rgba(2,6,8,0.70)_45%,rgba(2,6,8,0.35)),linear-gradient(180deg,rgba(2,6,8,0.22),rgba(2,6,8,0.98)_74%,#020608)]" />

      <section className="section-wrap relative z-10 flex min-h-screen flex-col px-4 pb-8 pt-6 sm:px-6 lg:pb-10 lg:pt-7">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="group flex min-w-0 items-center gap-3" aria-label="FastFleet landing home">
            <Image
              src="/fastfleet-logo.png"
              alt="FastFleet Logistics"
              width={56}
              height={56}
              className="h-11 w-11 rounded-full border border-white/20 bg-white object-cover p-1 shadow-[0_16px_34px_rgba(0,0,0,0.28)] transition group-hover:-translate-y-0.5"
              priority
            />
            <span className="grid leading-none">
              <strong className="text-lg font-black italic tracking-[0.02em] text-white sm:text-2xl">FASTFLEET</strong>
              <span className="mt-1 text-[0.58rem] font-black uppercase tracking-[0.42em] text-[#7EE817] sm:text-[0.64rem]">Logistics</span>
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
              className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[#6FE514] bg-[#6FE514] px-4 text-sm font-black text-fleet-night shadow-[0_0_32px_rgba(111,229,20,0.34)] transition hover:-translate-y-0.5 hover:bg-[#85f52d] focus:outline-none focus:ring-4 focus:ring-[#6FE514]/25 sm:min-h-14 sm:px-8 sm:text-base"
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
            <p className="text-base font-extrabold text-[#7EE817] sm:text-xl">Fast. Reliable. Always.</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[0.98] tracking-normal text-white sm:text-7xl lg:text-8xl">
              Delivering More, Everyday.
            </h1>
            <p className="mt-6 max-w-2xl text-base font-semibold leading-8 text-white/86 sm:text-xl">
              FastFleet connects people, businesses and communities through fast, safe and reliable delivery.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/main"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-fleet bg-[#6FE514] px-7 text-base font-black text-fleet-night shadow-[0_0_38px_rgba(111,229,20,0.35)] transition hover:-translate-y-0.5 hover:bg-[#85f52d] focus:outline-none focus:ring-4 focus:ring-[#6FE514]/25"
              >
                <CircleUserRound className="h-5 w-5" />
                Get Started
              </Link>
              <Link
                href="#launch-actions"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full text-base font-black text-white transition hover:-translate-y-0.5 hover:text-[#7EE817] focus:outline-none focus:ring-4 focus:ring-white/15"
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
          className="rounded-[22px] border border-white/14 bg-black/34 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-2xl sm:p-6"
          initial={reduceMotion ? false : { opacity: 0, y: 34 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="grid gap-2 md:grid-cols-4 md:gap-0">
            {actionItems.map((item, index) => (
              <ActionItem key={item.title} item={item} index={index} onAuth={setAuthIntent} />
            ))}
          </div>
        </motion.div>

        <div className="mx-auto mt-9 grid justify-items-center gap-7">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <StoreBadge icon={<AppleIcon className="h-8 w-8" />} eyebrow="Download on the" label="App Store" />
            <StoreBadge icon={<GoogleIcon className="h-8 w-8" />} eyebrow="GET IT ON" label="Google Play" />
          </div>
          <p className="text-sm font-semibold text-white/70">FastFleet mobile app coming soon.</p>
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
                    className="grid h-14 w-14 place-items-center rounded-full border border-white/80 bg-white/[0.03] text-white transition hover:-translate-y-1 hover:border-[#7EE817] hover:bg-[#7EE817] hover:text-fleet-night"
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
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-sm font-black uppercase tracking-normal text-[#7EE817]">OUR BRAND PARTNERS</h2>
          <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-5">
            <CarouselButton label="Previous partner logos" onClick={() => movePartners(-1)}>
              <ChevronLeft className="h-8 w-8" />
            </CarouselButton>
            <div className="grid grid-cols-2 gap-3 overflow-hidden sm:grid-cols-3 lg:grid-cols-6">
              {visiblePartners.map((partner, index) => (
                <motion.div
                  key={`${partner}-${index}`}
                  className="grid min-h-28 place-items-center rounded-[10px] bg-white px-4 text-center shadow-[0_16px_34px_rgba(0,0,0,0.28)] sm:min-h-36"
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.42, delay: index * 0.04 }}
                >
                  <span className="text-xl font-black tracking-tight text-fleet-night sm:text-2xl">
                    {partner}
                  </span>
                </motion.div>
              ))}
            </div>
            <CarouselButton label="Next partner logos" onClick={() => movePartners(1)}>
              <ChevronRight className="h-8 w-8" />
            </CarouselButton>
          </div>
          <footer className="pt-14 text-center text-sm font-semibold text-white/46">© 2025 FastFleet. All rights reserved.</footer>
        </div>
      </section>

      {authIntent ? <AuthModal intent={authIntent} onClose={() => setAuthIntent(null)} /> : null}
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
      <span className="grid h-16 w-16 place-items-center rounded-full bg-[#6FE514]/18 text-[#7EE817] shadow-[0_0_28px_rgba(111,229,20,0.16)]">
        <Icon className="h-8 w-8" />
      </span>
      <strong className="mt-5 block text-lg font-black text-white">{item.title}</strong>
      <span className="mt-3 block max-w-40 text-sm font-semibold leading-6 text-white/78">{item.body}</span>
    </>
  );
  const classes =
    "group relative block rounded-[18px] p-5 text-left transition hover:-translate-y-1 hover:bg-white/[0.06] focus:outline-none focus:ring-4 focus:ring-[#6FE514]/20 md:rounded-none md:px-7";

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

function StoreBadge({ icon, eyebrow, label }: { icon: ReactNode; eyebrow: string; label: string }) {
  return (
    <span className="inline-flex min-h-16 min-w-[230px] items-center justify-center gap-3 rounded-[10px] border border-white/70 bg-black px-5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.26)]">
      {icon}
      <span className="grid text-left leading-none">
        <span className="text-[0.68rem] font-black uppercase tracking-normal text-white/82">{eyebrow}</span>
        <strong className="mt-1 text-2xl font-black">{label}</strong>
      </span>
    </span>
  );
}

function CarouselButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid h-12 w-8 place-items-center text-[#7EE817] transition hover:-translate-y-0.5 hover:text-white sm:h-16 sm:w-12">
      {children}
    </button>
  );
}

function TikTokIcon(props: ComponentPropsWithoutRef<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M16.4 3c.38 2.24 1.7 3.58 3.9 3.73v3.18a7.1 7.1 0 0 1-3.78-1.12v6.1c0 3.08-2.1 5.11-5.14 5.11-2.72 0-4.88-1.83-4.88-4.45 0-2.89 2.43-4.85 5.64-4.29v3.28c-1.34-.43-2.38.15-2.38 1.08 0 .8.68 1.3 1.58 1.3 1.03 0 1.8-.59 1.8-2.09V3h3.26Z" />
    </svg>
  );
}

function AuthModal({ intent, onClose }: { intent: AuthIntent; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const title = intent === "signup" ? "Create your FastFleet account" : "Sign in to FastFleet";
  const description =
    intent === "signup"
      ? "Sign up with phone OTP, choose your access type, and continue into FastFleet."
      : "Enter your phone details to receive an OTP and return to your delivery workspace.";

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
