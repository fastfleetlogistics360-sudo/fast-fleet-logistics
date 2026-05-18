"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Bike, Building2, ChevronRight, LogIn, UserPlus, X } from "lucide-react";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { Button } from "@/components/ui/button";

const adverts = [
  {
    image: "/hero/customer-control.svg",
    label: "Customer dispatch advert",
    position: "left-0 top-0 rounded-br-[34px]"
  },
  {
    image: "/hero/same-day-dispatch.svg",
    label: "Same-day delivery advert",
    position: "right-0 top-0 rounded-bl-[34px]"
  },
  {
    image: "/hero/vehicle-income.svg",
    label: "Rider earnings advert",
    position: "bottom-0 left-0 rounded-tr-[34px]"
  },
  {
    image: "/hero/business-logistics.svg",
    label: "Business logistics advert",
    position: "bottom-0 right-0 rounded-tl-[34px]"
  }
];

type AuthIntent = "signup" | "login";

export function LaunchLandingPage() {
  const [authIntent, setAuthIntent] = useState<AuthIntent | null>(null);
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate grid min-h-[88dvh] place-items-center overflow-hidden bg-[#fffdf7] px-4 py-10 text-fleet-night sm:px-6">
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,246,226,0.94),rgba(255,255,255,0.98)_28%,rgba(255,255,255,0.98)_72%,rgba(239,246,255,0.94))]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,166,42,0.16),transparent_30%),radial-gradient(circle_at_10%_76%,rgba(15,52,96,0.12),transparent_32%),radial-gradient(circle_at_92%_72%,rgba(21,163,107,0.12),transparent_32%)]" />
        {adverts.map((advert) => (
          <motion.div
            key={advert.image}
            className={`absolute h-40 w-[44vw] max-w-[310px] overflow-hidden shadow-[0_28px_80px_rgba(8,17,31,0.14)] opacity-[0.16] sm:h-60 md:w-[24vw] ${advert.position}`}
            initial={reduceMotion ? false : { opacity: 0, scale: 1.04 }}
            animate={reduceMotion ? undefined : { opacity: 0.16, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <Image src={advert.image} alt={advert.label} fill className="object-cover object-center saturate-[0.68]" sizes="310px" />
          </motion.div>
        ))}
      </div>

      <motion.div
        className="relative z-10 grid w-full max-w-[780px] justify-items-center rounded-b-[34px] bg-white/85 px-4 py-8 text-center shadow-[0_30px_90px_rgba(8,17,31,0.12)] backdrop-blur-xl sm:px-8 sm:py-10"
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <Image
          src="/fastfleet-logo.png"
          alt="FastFleet Logistics"
          width={330}
          height={190}
          className="max-h-[190px] w-[min(74vw,330px)] rounded-[24px] bg-[#fff8e8]/90 object-contain p-4 shadow-[0_20px_60px_rgba(8,17,31,0.1)]"
          priority
        />

        <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[0.95] text-fleet-navy sm:text-6xl lg:text-7xl">
          FAST FLEET LOGISTICS
        </h1>
        <p className="mt-6 max-w-[700px] text-base font-semibold leading-7 text-slate-700 sm:text-lg">
          FastFleet is built for same-day parcel movement, vendor dispatch, rider income, and live delivery tracking across Nigerian cities.
          Customers, businesses, and riders can connect through one clean logistics platform.
        </p>
        <p className="mt-4 max-w-[680px] text-base font-semibold leading-7 text-slate-700 sm:text-lg">
          Sign up, sign in, or proceed to the main dispatch page to book, track, and manage deliveries.
        </p>

        <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
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
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet border border-fleet-navy/15 bg-white/80 px-5 text-base font-extrabold uppercase text-fleet-navy shadow-[0_14px_32px_rgba(8,17,31,0.08)] transition duration-200 hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-fleet-gold/20"
          >
            Proceed to Main Page
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-3 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/auth?account=driver"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet border border-fleet-navy bg-fleet-night px-5 text-base font-extrabold uppercase text-white shadow-[0_14px_32px_rgba(8,17,31,0.14)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#10233a] focus:outline-none focus:ring-4 focus:ring-fleet-gold/20"
          >
            <Bike className="h-4 w-4" />
            Register as a driver
          </Link>
          <Link
            href="/auth?account=business"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet border border-fleet-navy/15 bg-white/90 px-5 text-base font-extrabold uppercase text-fleet-navy shadow-[0_14px_32px_rgba(8,17,31,0.08)] transition duration-200 hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-fleet-gold/20"
          >
            <Building2 className="h-4 w-4" />
            Register a business
          </Link>
        </div>
      </motion.div>

      {authIntent ? <AuthModal intent={authIntent} onClose={() => setAuthIntent(null)} /> : null}
    </section>
  );
}

function AuthModal({ intent, onClose }: { intent: AuthIntent; onClose: () => void }) {
  const title = intent === "signup" ? "Create your FastFleet account" : "Sign in to FastFleet";
  const description =
    intent === "signup"
      ? "Sign up with phone OTP, choose your access type, and continue into FastFleet."
      : "Enter your phone details to receive an OTP and return to your delivery workspace.";

  return (
    <motion.div
      className="fixed inset-0 z-[80] grid place-items-center bg-fleet-night/70 px-3 py-8 backdrop-blur-sm"
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
    </motion.div>
  );
}
