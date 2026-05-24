"use client";

import Image from "next/image";
import { useRef, useState, type UIEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bike, PackageCheck, ShoppingBag, Utensils } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const dealBlurDataURL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nOScgdmlld0JveD0nMCAwIDE2IDknIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzknIGZpbGw9JyNmNmY4ZmInLz48Y2lyY2xlIGN4PScxMicgY3k9JzInIHI9JzUnIGZpbGw9JyNlZjZjMDAnIG9wYWNpdHk9Jy4yMicvPjwvc3ZnPg==";

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
  const [activeDeal, setActiveDeal] = useState(0);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    const firstCard = cardRefs.current[0];
    if (!firstCard) return;
    const gap = 12;
    const nextIndex = Math.round(node.scrollLeft / (firstCard.offsetWidth + gap));
    setActiveDeal(Math.max(0, Math.min(deals.length - 1, nextIndex)));
  }

  function goToDeal(index: number) {
    cardRefs.current[index]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "start", block: "nearest" });
    setActiveDeal(index);
  }

  return (
    <section className="defer-render overflow-hidden bg-white py-8 sm:py-12">
      <div className="section-wrap">
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Advert deals</span>
            <h2 className="mt-2 text-2xl font-black text-fleet-night sm:text-4xl">Offers, food, shopping, dispatch.</h2>
          </div>
          <LinkButton href="/book" variant="secondary" className="hidden sm:inline-flex">
            Book delivery
            <ArrowRight className="h-4 w-4" />
          </LinkButton>
        </div>

        <div
          className="-mx-4 mt-5 flex snap-x gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
          onScroll={handleScroll}
        >
          {deals.map((deal, index) => {
            const Icon = deal.icon;
            return (
              <motion.article
                key={deal.title}
                ref={(node) => {
                  cardRefs.current[index] = node;
                }}
                className="relative w-[min(45vw,174px)] shrink-0 snap-start overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_12px_26px_rgba(8,17,31,0.08)] lg:w-auto"
                initial={reduceMotion ? false : { opacity: 0, y: 28 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                whileHover={reduceMotion ? undefined : { y: -4 }}
                viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.55, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="relative aspect-[16/9] bg-fleet-paper">
                  <Image src={deal.image} alt="" fill className="object-cover object-center" sizes="(min-width: 1024px) 25vw, 45vw" quality={62} loading="lazy" placeholder="blur" blurDataURL={dealBlurDataURL} />
                  <span className="absolute left-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-fleet bg-white text-fleet-night shadow-[0_10px_20px_rgba(8,17,31,0.12)]">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <div className="p-3 text-fleet-night sm:p-4">
                  <h3 className="text-sm font-black leading-tight sm:text-lg">{deal.title}</h3>
                  <p className="mt-1 hidden text-xs font-bold leading-5 text-slate-500 sm:block">{deal.body}</p>
                  <LinkButton href={deal.href} size="sm" variant="secondary" className="mt-3 w-full bg-white text-xs">
                    {deal.cta}
                  </LinkButton>
                </div>
              </motion.article>
            );
          })}
        </div>
        <div className="mt-1 flex justify-center gap-2 lg:hidden" aria-label="Advert deal pages">
          {deals.map((deal, index) => (
            <button
              key={deal.title}
              type="button"
              aria-label={`Show ${deal.title}`}
              onClick={() => goToDeal(index)}
              className={cn("h-2 rounded-full transition-all", activeDeal === index ? "w-6 bg-fleet-ember" : "w-2 bg-slate-300")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
