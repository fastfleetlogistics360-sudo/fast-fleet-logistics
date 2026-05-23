"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bike, Building2, ChevronRight, LogIn, Play, Smartphone, UserPlus, X } from "lucide-react";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { Button } from "@/components/ui/button";

const landingSlides = [
  {
    image: "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=1600&q=82",
    eyebrow: "FastFleet Logistics",
    title: "Same-day dispatch for customers, riders, and businesses.",
    body: "Book deliveries, track riders, fund wallets, and manage operations from one clean FastFleet workspace."
  },
  {
    image: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=1600&q=82",
    eyebrow: "Live movement",
    title: "Every parcel gets a clear route and visible status.",
    body: "FastFleet keeps pickup, transit, delivery, support, and wallet actions close to the people who need them."
  },
  {
    image: "https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&w=1600&q=82",
    eyebrow: "Food delivery",
    title: "Restaurant orders move with the same FastFleet care.",
    body: "Food vendors and customers can keep meals, riders, and delivery updates in one reliable flow."
  },
  {
    image: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=1600&q=82",
    eyebrow: "Shopping delivery",
    title: "Shopping, parcels, and business deliveries stay organized.",
    body: "Businesses get saved pickup points, route tracking, wallet controls, receipts, and support."
  }
];

type AuthIntent = "signup" | "login";

export function LaunchLandingPage() {
  const [authIntent, setAuthIntent] = useState<AuthIntent | null>(null);
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();
  const slide = landingSlides[active];

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setActive((value) => (value + 1) % landingSlides.length);
    }, 5800);

    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <section className="relative isolate min-h-screen overflow-hidden bg-[#071426] px-4 py-6 text-white sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-white/[0.03]" aria-hidden="true" />
      <div className="section-wrap relative z-10 grid min-h-[calc(100vh-48px)] content-center gap-8 py-4 sm:py-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(440px,1fr)] lg:items-center">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <Image
              src="/fastfleet-logo.png"
              alt="FastFleet Logistics"
              width={64}
              height={64}
              className="h-14 w-14 rounded-fleet border border-white/15 bg-white object-cover p-1 shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
              priority
            />
            <span className="grid">
              <strong className="text-base font-black">FastFleet Logistics</strong>
              <span className="text-[0.66rem] font-black uppercase tracking-[0.26em] text-fleet-gold">Premium dispatch app</span>
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={slide.title}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <span className="mt-7 inline-flex rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-fleet-gold shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                {slide.eyebrow}
              </span>
              <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[0.98] text-white sm:text-6xl">
                {slide.title}
              </h1>
              <p className="mt-5 max-w-xl text-base font-semibold leading-7 text-white/78 sm:text-lg">
                {slide.body}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button type="button" size="lg" onClick={() => setAuthIntent("signup")} className="min-w-36 uppercase">
              <UserPlus className="h-4 w-4" />
              Sign Up
            </Button>
            <Button type="button" size="lg" variant="secondary" onClick={() => setAuthIntent("login")} className="min-w-36 uppercase">
              <LogIn className="h-4 w-4" />
              Sign In
            </Button>
            <Link
              href="/main"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet border border-white/15 bg-white px-5 text-base font-extrabold uppercase text-fleet-night shadow-[0_14px_32px_rgba(8,17,31,0.08)] transition duration-200 hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-fleet-gold/20"
            >
              Proceed to Main Page
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="/auth?account=driver"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet border border-white/15 bg-fleet-night/88 px-5 text-base font-extrabold uppercase text-white shadow-[0_14px_32px_rgba(8,17,31,0.14)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#10233a] focus:outline-none focus:ring-4 focus:ring-fleet-gold/20"
            >
              <Bike className="h-4 w-4" />
              Register as a driver
            </Link>
            <Link
              href="/auth?account=business"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet border border-white/15 bg-white/92 px-5 text-base font-extrabold uppercase text-fleet-night shadow-[0_14px_32px_rgba(8,17,31,0.08)] transition duration-200 hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-fleet-gold/20"
            >
              <Building2 className="h-4 w-4" />
              Register a business
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <StoreBadge icon={<Smartphone className="h-4 w-4" />} label="App Store" />
            <StoreBadge icon={<Play className="h-4 w-4" />} label="Play Store" />
            <span className="text-xs font-black uppercase tracking-[0.16em] text-white/62">Mobile apps coming soon</span>
          </div>
        </div>

        <div className="relative min-h-[280px] sm:min-h-[420px] lg:min-h-[560px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.image}
              className="absolute inset-0 overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.36)]"
              initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -12, scale: 0.99 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <Image src={slide.image} alt={slide.title} fill className="object-cover object-center" sizes="(min-width: 1024px) 50vw, 100vw" priority />
              <div className="absolute inset-x-4 bottom-4 rounded-[20px] border border-white/65 bg-white/92 p-4 text-fleet-night shadow-[0_18px_45px_rgba(8,17,31,0.16)] backdrop-blur-md sm:inset-x-5 sm:bottom-5 sm:p-5">
                <span className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-fleet-ember">Live app preview</span>
                <strong className="mt-1 block text-lg font-black leading-tight sm:text-2xl">{slide.eyebrow}</strong>
                <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-600 sm:text-sm">{slide.body}</p>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="absolute -bottom-4 left-4 right-4 flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:left-10 sm:right-auto">
            {landingSlides.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setActive(index)}
                className={`h-2 rounded-full transition-all ${active === index ? "w-10 bg-fleet-gold" : "w-2 bg-white/55 hover:bg-white"}`}
                aria-label={`Show landing slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {authIntent ? <AuthModal intent={authIntent} onClose={() => setAuthIntent(null)} /> : null}
    </section>
  );
}

function StoreBadge({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-h-10 items-center gap-2 rounded-fleet border border-white/12 bg-white/[0.08] px-3 text-xs font-black text-white shadow-[0_14px_30px_rgba(0,0,0,0.16)]">
      {icon}
      <span>{label}</span>
    </span>
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
