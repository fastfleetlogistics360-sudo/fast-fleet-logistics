"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bike, BriefcaseBusiness, Clock3, Handshake, PackageCheck, Play, ShieldCheck, ShoppingBag, Smartphone, Store, Truck, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatedDescriptionCards } from "@/components/landing/animated-description-cards";
import type { DescriptionCard } from "@/components/landing/animated-description-cards";
import { LinkButton } from "@/components/ui/button";

const serviceCards: DescriptionCard[] = [
  {
    label: "Food",
    title: "Food delivery",
    body: "Move meals from restaurants and vendors with speed, care, and clear delivery updates.",
    image: "https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&w=1200&q=80",
    icon: Utensils
  },
  {
    label: "Parcel",
    title: "Parcel delivery",
    body: "Send documents, retail packages, gifts, and everyday errands across your city.",
    image: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=1200&q=80",
    icon: PackageCheck
  },
  {
    label: "Business",
    title: "Business logistics",
    body: "Give vendors and offices a dependable layer for repeat dispatch and customer handoffs.",
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",
    icon: BriefcaseBusiness
  },
  {
    label: "Same day",
    title: "Same-day dispatch",
    body: "Move urgent items quickly with riders built for fast city routes and visible progress.",
    image: "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=1200&q=80",
    icon: Clock3
  },
  {
    label: "Riders",
    title: "Rider partnership",
    body: "Verified riders can onboard, earn from delivery trips, and grow with FastFleet.",
    image: "https://images.unsplash.com/photo-1616432043562-3671ea2e5242?auto=format&fit=crop&w=1200&q=80",
    icon: Bike
  }
];

const trustCards: DescriptionCard[] = [
  {
    label: "Speed",
    title: "Fast riders",
    body: "Nearby riders help keep pickup and delivery windows tight for everyday city movement.",
    image: "https://images.unsplash.com/photo-1597074866923-dc0589150358?auto=format&fit=crop&w=1200&q=80",
    icon: Bike
  },
  {
    label: "Tracking",
    title: "Live tracking",
    body: "Customers and businesses can follow delivery progress from dispatch to final handoff.",
    image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80",
    icon: Truck
  },
  {
    label: "Secure",
    title: "Secure delivery",
    body: "FastFleet keeps rider, package, route, and support details tied to each delivery.",
    image: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1200&q=80",
    icon: ShieldCheck
  },
  {
    label: "Fair",
    title: "Affordable pricing",
    body: "Clear distance-based delivery estimates help you know the cost before you book.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80",
    icon: Handshake
  }
];

const ctaCards = [
  {
    label: "Customers",
    title: "Send a package now",
    body: "Book a FastFleet rider for documents, food, parcels, shopping, and urgent errands.",
    href: "/book",
    cta: "Book delivery",
    image: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=1200&q=80",
    icon: PackageCheck
  },
  {
    label: "Riders",
    title: "Earn with FastFleet",
    body: "Apply as a rider, complete onboarding, and get ready for delivery opportunities.",
    href: "/auth?account=driver",
    cta: "Become a rider",
    image: "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=1200&q=80",
    icon: Bike
  },
  {
    label: "Businesses",
    title: "Partner with FastFleet",
    body: "Give your store, office, or dispatch team a more reliable delivery layer.",
    href: "/business/register",
    cta: "Register business",
    image: "https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=1200&q=80",
    icon: Store
  }
];

export function MainPageSections() {
  return (
    <>
      <AnimatedDescriptionCards
        surface="light"
        eyebrow="FastFleet services"
        title="Delivery options for real city movement."
        body="FastFleet keeps everyday logistics simple for customers, restaurants, vendors, offices, riders, and growing businesses."
        cards={serviceCards}
      />
      <AudienceCtaSection />
      <AnimatedDescriptionCards
        eyebrow="Why people trust FastFleet"
        title="Useful delivery confidence, not noise."
        body="FastFleet combines rider speed, live visibility, safer package movement, and transparent pricing into one delivery experience."
        cards={trustCards}
      />
      <AppComingSoonSection />
    </>
  );
}

function AudienceCtaSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="overflow-hidden bg-[linear-gradient(135deg,rgb(var(--fleet-night)),rgb(var(--fleet-navy))_58%,rgb(12,82,92))] py-12 text-white sm:py-16">
      <div className="section-wrap">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-gold">Move with FastFleet</span>
            <h2 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">One delivery page for customers, riders, and businesses.</h2>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/72 sm:text-base">
              Book a delivery, start rider onboarding, or create a business dispatch account without leaving the FastFleet flow.
            </p>
          </div>
          <LinkButton href="/book" variant="secondary" className="w-full sm:w-auto">
            Start booking
            <ArrowRight className="h-4 w-4" />
          </LinkButton>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {ctaCards.map((card, index) => (
            <ActionCard key={card.title} card={card} index={index} reduceMotion={Boolean(reduceMotion)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ActionCard({
  card,
  index,
  reduceMotion
}: {
  card: (typeof ctaCards)[number];
  index: number;
  reduceMotion: boolean;
}) {
  const Icon = card.icon;

  return (
    <motion.article
      className="group relative overflow-hidden rounded-fleet border border-white/15 bg-white text-fleet-night shadow-[0_20px_54px_rgba(0,0,0,0.22)]"
      initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.97 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      whileHover={reduceMotion ? undefined : { y: -5 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.56, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-fleet-paper">
        <Image src={card.image} alt="" fill className="object-cover object-center transition duration-700 group-hover:scale-[1.04]" sizes="(min-width: 1024px) 33vw, 100vw" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-fleet bg-fleet-ember px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white shadow-[0_10px_22px_rgba(239,108,0,0.24)]">
          <Icon className="h-4 w-4" />
          {card.label}
        </span>
      </div>
      <div className="p-5">
        <h3 className="text-2xl font-black leading-tight">{card.title}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{card.body}</p>
        <LinkButton href={card.href} className="mt-5 w-full">
          {card.cta}
          <ArrowRight className="h-4 w-4" />
        </LinkButton>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-fleet-ember via-fleet-gold to-fleet-leaf transition duration-300 group-hover:scale-x-100" />
    </motion.article>
  );
}

function AppComingSoonSection() {
  return (
    <section className="bg-white py-12 sm:py-16">
      <div className="section-wrap">
        <div className="grid gap-6 rounded-fleet border border-fleet-line bg-fleet-paper p-5 shadow-[0_18px_48px_rgba(8,17,31,0.08)] sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Mobile app</span>
            <h2 className="mt-3 text-3xl font-black leading-tight text-fleet-night sm:text-5xl">FastFleet mobile app coming soon</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              The web experience is ready today. Native app access for customers, riders, and businesses is on the way.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <StoreBadge icon={Play} label="Play Store" />
            <StoreBadge icon={Smartphone} label="App Store" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StoreBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-fleet border border-fleet-line bg-white px-4 text-sm font-black text-fleet-night shadow-[0_10px_24px_rgba(8,17,31,0.08)]">
      <Icon className="h-4 w-4 text-fleet-ember" />
      {label}
    </span>
  );
}
