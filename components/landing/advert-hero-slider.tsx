"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, Bike, Clock3, MapPinned, ShieldCheck, Truck } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

const slides = [
  {
    eyebrow: "FastFleet for customers",
    title: "Send parcels across Lagos with calm, visible control.",
    copy: "Book bike, car, and van deliveries with live status, trusted riders, and clear customer updates.",
    image: "/hero/customer-control.svg",
    icon: MapPinned
  },
  {
    eyebrow: "Same-day dispatch",
    title: "From pickup request to doorstep handoff, beautifully tracked.",
    copy: "Built for retail vendors, offices, food dispatch, pharmacy runs, and urgent city movement.",
    image: "/hero/same-day-dispatch.svg",
    icon: Clock3
  },
  {
    eyebrow: "Earn with your vehicle",
    title: "Own a bike, car, or van? Turn it into daily delivery income.",
    copy: "Vehicle owners and delivery partners can apply, upload documents, get reviewed, and start receiving jobs.",
    image: "/hero/vehicle-income.svg",
    icon: Truck
  },
  {
    eyebrow: "Business logistics",
    title: "A polished dispatch layer for vendors and fleet operators.",
    copy: "Saved addresses, scheduled routes, wallet records, support tickets, rider monitoring, and admin controls.",
    image: "/hero/business-logistics.svg",
    icon: BadgeCheck
  },
  {
    eyebrow: "Trusted rider network",
    title: "Premium logistics for Lagos and Ogun State movement.",
    copy: "Zone-based dispatch, rider approval workflows, realtime locations, and support built for scale.",
    image: "/hero/trusted-network.svg",
    icon: ShieldCheck
  }
];

export function AdvertHeroSlider() {
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();
  const slide = slides[active];
  const Icon = slide.icon;

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setActive((value) => (value + 1) % slides.length);
    }, 6200);

    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <section className="relative isolate min-h-[calc(100vh-76px)] overflow-hidden bg-fleet-night text-white">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.image}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${slide.image})` }}
          initial={reduceMotion ? false : { opacity: 0, scale: 1.035 }}
          animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, scale: 1.02 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,31,0.92),rgba(8,17,31,0.68)_48%,rgba(8,17,31,0.28)),linear-gradient(180deg,rgba(8,17,31,0.2),rgba(8,17,31,0.88))]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:46px_46px]" />

      <div className="section-wrap relative z-10 grid min-h-[calc(100vh-76px)] content-center py-12">
        <div className="max-w-3xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.title}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-fleet-gold backdrop-blur-xl">
                <Icon className="h-4 w-4" />
                {slide.eyebrow}
              </span>
              <h1 className="mt-5 text-4xl font-black leading-[0.94] text-white sm:text-6xl lg:text-7xl">
                {slide.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-white/75 sm:text-lg">
                {slide.copy}
              </p>
            </motion.div>
          </AnimatePresence>

          <motion.div
            className="mt-8 flex flex-col gap-3 sm:flex-row"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.48 }}
          >
            <LinkButton href="/auth" size="lg">
              Create account
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
            <LinkButton href="/auth?account=driver" variant="dark" size="lg">
              <Bike className="h-4 w-4" />
              Register as a driver
            </LinkButton>
            <LinkButton href="/auth?account=business" variant="secondary" size="lg">
              Register a business
            </LinkButton>
            <LinkButton href="/auth" variant="secondary" size="lg">
              Sign in
            </LinkButton>
            <LinkButton href="/auth?account=driver" variant="dark" size="lg">
              <Bike className="h-4 w-4" />
              Earn with delivery
            </LinkButton>
          </motion.div>

          <div className="mt-10 flex flex-wrap gap-2">
            {slides.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setActive(index)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  active === index ? "w-12 bg-fleet-gold" : "w-5 bg-white/40 hover:bg-white/70"
                }`}
                aria-label={`Show advert ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
