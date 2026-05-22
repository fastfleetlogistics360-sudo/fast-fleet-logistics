"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bike, Building2, ChevronRight, LogIn, UserPlus, X } from "lucide-react";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { Button } from "@/components/ui/button";

const landingSlides = [
  {
    image: "/hero/customer-control.svg",
    eyebrow: "FastFleet Logistics",
    title: "Same-day dispatch for customers, riders, and businesses.",
    body: "Book deliveries, track riders, fund wallets, and manage operations from one clean FastFleet workspace."
  },
  {
    image: "/hero/same-day-dispatch.svg",
    eyebrow: "Live movement",
    title: "Every parcel gets a clear route and visible status.",
    body: "FastFleet keeps pickup, transit, delivery, support, and wallet actions close to the people who need them."
  },
  {
    image: "/hero/vehicle-income.svg",
    eyebrow: "Driver income",
    title: "Turn your vehicle into verified delivery work.",
    body: "Drivers can register, complete review, go online, receive jobs, and manage earnings from the dashboard."
  },
  {
    image: "/hero/business-logistics.svg",
    eyebrow: "Business logistics",
    title: "A sharper dispatch layer for vendors and teams.",
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
    <section className="relative isolate grid min-h-screen overflow-hidden bg-fleet-night px-4 py-8 text-white sm:px-6">
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.image}
            className="absolute inset-0"
            initial={reduceMotion ? false : { opacity: 0, scale: 1.04 }}
            animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 1.02 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          >
            <Image src={slide.image} alt={slide.title} fill className="object-cover object-center" sizes="100vw" priority />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,31,0.96),rgba(8,17,31,0.74)_48%,rgba(8,17,31,0.34)),linear-gradient(180deg,rgba(8,17,31,0.22),rgba(8,17,31,0.88))]" />
      </div>

      <div className="section-wrap relative z-10 grid min-h-[calc(100vh-64px)] content-center">
        <div className="max-w-3xl">
          <Image
            src="/fastfleet-logo.png"
            alt="FastFleet Logistics"
            width={86}
            height={86}
            className="h-20 w-20 rounded-fleet border border-white/20 bg-white object-cover p-1 shadow-[0_20px_60px_rgba(0,0,0,0.24)]"
            priority
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.title}
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.56, ease: "easeOut" }}
            >
              <span className="mt-8 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-fleet-gold backdrop-blur-xl">
                {slide.eyebrow}
              </span>
              <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[0.95] text-white drop-shadow-[0_8px_28px_rgba(0,0,0,0.42)] sm:text-6xl lg:text-7xl">
                {slide.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-white/85 sm:text-lg">
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

          <div className="mt-10 flex gap-2">
            {landingSlides.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setActive(index)}
                className={`h-1.5 rounded-full transition-all ${active === index ? "w-12 bg-fleet-gold" : "w-5 bg-white/45 hover:bg-white/75"}`}
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
