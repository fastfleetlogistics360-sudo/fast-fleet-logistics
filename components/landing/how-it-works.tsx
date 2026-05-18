"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MapPin, PackageCheck, Route, UserCheck } from "lucide-react";

const steps = [
  {
    label: "Set locations",
    title: "Tell FastFleet where pickup starts and where the package lands.",
    body: "Clear address capture for Lagos, Ogun, vendor dispatch, and scheduled movement.",
    icon: MapPin
  },
  {
    label: "Choose delivery mode",
    title: "Select bike, car, or van based on urgency, package size, and route.",
    body: "The platform keeps the experience simple while the dispatch layer handles matching logic.",
    icon: PackageCheck
  },
  {
    label: "Match a verified rider",
    title: "Nearby approved partners receive the request with route and earning context.",
    body: "Matching favors online status, distance, acceptance rate, rating, and vehicle fit.",
    icon: UserCheck
  },
  {
    label: "Track to completion",
    title: "Watch status, ETA, rider movement, and delivery proof in realtime.",
    body: "Customers, riders, and admins stay aligned from acceptance to confirmation.",
    icon: Route
  }
];

export function HowItWorks() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="bg-white py-14 sm:py-20">
      <div className="section-wrap">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
        >
          <span className="text-xs font-black uppercase tracking-[0.2em] text-fleet-ember">How it works</span>
          <h2 className="mt-3 text-3xl font-black leading-tight text-fleet-night sm:text-5xl">
            Request, match, track, deliver.
          </h2>
          <p className="mt-4 text-sm font-semibold leading-7 text-slate-600 sm:text-base">
            A simple customer journey backed by serious logistics intelligence.
          </p>
        </motion.div>

        <div className="relative mt-10 grid gap-4 lg:grid-cols-4">
          <div className="absolute left-0 right-0 top-10 hidden h-px bg-gradient-to-r from-transparent via-fleet-gold/70 to-transparent lg:block" />
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.article
                key={step.label}
                className="relative rounded-fleet border border-fleet-line bg-white p-5 shadow-[0_18px_40px_rgba(8,17,31,0.07)] transition hover:-translate-y-1 hover:shadow-lift"
                initial={reduceMotion ? false : { opacity: 0, y: 24 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.span
                  className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-night text-white shadow-lift"
                  whileHover={reduceMotion ? undefined : { rotate: -4, scale: 1.06 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16 }}
                >
                  <Icon className="h-5 w-5" />
                </motion.span>
                <span className="mt-5 block text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">
                  0{index + 1} / {step.label}
                </span>
                <h3 className="mt-3 text-xl font-black leading-tight text-fleet-night">{step.title}</h3>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{step.body}</p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
