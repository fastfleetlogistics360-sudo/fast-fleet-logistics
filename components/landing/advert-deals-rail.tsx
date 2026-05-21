"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bike, PackageCheck, ShoppingBag, Utensils } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

const deals = [
  {
    title: "25% off your first 2 deliveries",
    body: "Book a verified rider, car, or van and track every parcel from pickup to drop-off.",
    image: "/hero/same-day-dispatch.svg",
    href: "/book",
    cta: "Book now",
    icon: PackageCheck
  },
  {
    title: "Restaurant orders delivered fast",
    body: "Order meals, add delivery, and checkout through Paystack with FastFleet handling movement.",
    image: "/hero/customer-control.svg",
    href: "/restaurants",
    cta: "Order food",
    icon: Utensils
  },
  {
    title: "Shopping mall pickup support",
    body: "Pick mall items, calculate the basket, and send them with a verified courier.",
    image: "/hero/business-logistics.svg",
    href: "/shopping-mall",
    cta: "Shop now",
    icon: ShoppingBag
  },
  {
    title: "Drivers earn with every trip",
    body: "Register, complete KYC, and get reviewed by FastFleet operations before going live.",
    image: "/hero/vehicle-income.svg",
    href: "/rider/onboarding",
    cta: "Drive now",
    icon: Bike
  }
];

export function AdvertDealsRail() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="overflow-hidden bg-white py-10 sm:py-14">
      <div className="section-wrap">
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Advert deals</span>
            <h2 className="mt-2 text-3xl font-black text-fleet-night sm:text-4xl">Offers, food, shopping, dispatch.</h2>
          </div>
          <LinkButton href="/book" variant="secondary" className="hidden sm:inline-flex">
            Book delivery
            <ArrowRight className="h-4 w-4" />
          </LinkButton>
        </div>

        <div className="-mx-4 mt-7 flex snap-x gap-4 overflow-x-auto px-4 pb-5 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
          {deals.map((deal, index) => {
            const Icon = deal.icon;
            return (
              <motion.article
                key={deal.title}
                className="relative w-[min(86vw,390px)] shrink-0 snap-start overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_22px_55px_rgba(8,17,31,0.12)] lg:w-auto"
                initial={reduceMotion ? false : { opacity: 0, y: 28 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                whileHover={reduceMotion ? undefined : { y: -7 }}
                viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.55, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="bg-black p-5 text-white">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-fleet bg-white text-fleet-night">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-2xl font-black leading-tight">{deal.title}</h3>
                  <p className="mt-3 min-h-[4.5rem] text-sm font-bold leading-6 text-white/72">{deal.body}</p>
                  <LinkButton href={deal.href} variant="secondary" className="mt-5 bg-white">
                    {deal.cta}
                  </LinkButton>
                </div>
                <div className="relative aspect-[16/10] bg-fleet-paper">
                  <Image src={deal.image} alt="" fill className="object-cover object-center" sizes="(min-width: 1024px) 25vw, 86vw" />
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
