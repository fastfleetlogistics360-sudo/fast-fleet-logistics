"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bike, BriefcaseBusiness, Clock3, Handshake, PackageCheck, Play, ShieldCheck, Smartphone, Store, Truck, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatedDescriptionCards } from "@/components/landing/animated-description-cards";
import type { DescriptionCard } from "@/components/landing/animated-description-cards";
import { LinkButton } from "@/components/ui/button";

const sectionBlurDataURL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nOScgdmlld0JveD0nMCAwIDE2IDknIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzknIGZpbGw9JyNmNmY4ZmInLz48Y2lyY2xlIGN4PScxMicgY3k9JzInIHI9JzUnIGZpbGw9JyNmNGE2MmEnIG9wYWNpdHk9Jy4yMicvPjwvc3ZnPg==";

const serviceCards: DescriptionCard[] = [
  {
    label: "Food",
    title: "Food delivery",
    body: "Order meals with clear pickup and delivery updates.",
    image: "https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&w=1200&q=80",
    icon: Utensils
  },
  {
    label: "Parcel",
    title: "Parcel delivery",
    body: "Send documents, packages, gifts, and everyday items.",
    image: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=1200&q=80",
    icon: PackageCheck
  },
  {
    label: "Business",
    title: "Business logistics",
    body: "Manage repeat dispatches and customer handoffs from one dashboard.",
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",
    icon: BriefcaseBusiness
  },
  {
    label: "Same day",
    title: "Same-day dispatch",
    body: "Move urgent items with live status and route updates.",
    image: "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=1200&q=80",
    icon: Clock3
  },
  {
    label: "Riders",
    title: "Rider partnership",
    body: "Complete verification, accept jobs, and manage earnings.",
    image: "https://images.unsplash.com/photo-1616432043562-3671ea2e5242?auto=format&fit=crop&w=1200&q=80",
    icon: Bike
  }
];

const trustCards: DescriptionCard[] = [
  {
    label: "Speed",
    title: "Responsive dispatch",
    body: "Available riders receive jobs matched to their operating area.",
    image: "https://images.unsplash.com/photo-1597074866923-dc0589150358?auto=format&fit=crop&w=1200&q=80",
    icon: Bike
  },
  {
    label: "Tracking",
    title: "Live tracking",
    body: "Customers and businesses can follow each ongoing delivery.",
    image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80",
    icon: Truck
  },
  {
    label: "Secure",
    title: "Secure delivery",
    body: "Rider, package, route, and support records stay linked to each job.",
    image: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1200&q=80",
    icon: ShieldCheck
  },
  {
    label: "Fair",
    title: "Affordable pricing",
    body: "Review distance-based pricing before you book.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80",
    icon: Handshake
  }
];

const ctaCards = [
  {
    label: "Customers",
    title: "Send a package now",
    body: "Book delivery for documents, food, parcels, shopping, and urgent items.",
    href: "/book",
    cta: "Book delivery",
    image: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=1200&q=80",
    icon: PackageCheck
  },
  {
    label: "Riders",
    title: "Earn with Fast Fleets 360",
    body: "Apply, complete verification, and receive delivery opportunities.",
    href: "/auth?account=driver",
    cta: "Become a rider",
    image: "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=1200&q=80",
    icon: Bike
  },
  {
    label: "Businesses",
    title: "Partner with Fast Fleets 360",
    body: "Manage store, office, and customer deliveries from one workspace.",
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
        eyebrow="Fast Fleets 360 services"
        title="Delivery for customers and businesses."
        body="Choose the service that fits your delivery."
        cards={serviceCards}
      />
      <AudienceCtaSection />
      <AnimatedDescriptionCards
        eyebrow="Why people trust Fast Fleets 360"
        title="Built for dependable delivery."
        body="Clear pricing, verified accounts, and live job updates."
        cards={trustCards}
      />
      <AppComingSoonSection />
    </>
  );
}

function AudienceCtaSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="overflow-hidden bg-fleet-night py-8 text-white sm:py-10">
      <div className="section-wrap">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-gold">Move with Fast Fleets 360</span>
            <h2 className="mt-3 text-2xl font-black leading-tight sm:text-4xl">One platform for customers, riders, and businesses.</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/[0.88]">
              Book a delivery, apply as a rider, or create a business account.
            </p>
          </div>
          <LinkButton href="/book" variant="secondary" className="w-full sm:w-auto">
            Start booking
            <ArrowRight className="h-4 w-4" />
          </LinkButton>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
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
      className="group relative overflow-hidden rounded-[18px] border border-white/25 bg-white/[0.82] text-fleet-night shadow-[0_14px_34px_rgba(0,0,0,0.16)] backdrop-blur-2xl"
      initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.97 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      whileHover={reduceMotion ? undefined : { y: -5 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.56, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-fleet-paper">
        <Image src={card.image} alt="" fill className="object-cover object-center transition duration-700 group-hover:scale-[1.04]" sizes="(min-width: 1024px) 33vw, 100vw" quality={62} loading="lazy" placeholder="blur" blurDataURL={sectionBlurDataURL} />
        <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-[12px] bg-fleet-ember px-2.5 py-1.5 text-[0.68rem] font-black uppercase tracking-[0.11em] text-white shadow-[0_10px_22px_rgba(239,108,0,0.20)]">
          <Icon className="h-4 w-4" />
          {card.label}
        </span>
      </div>
      <div className="p-3.5">
        <h3 className="text-lg font-black leading-tight">{card.title}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{card.body}</p>
        <LinkButton href={card.href} className="mt-4 w-full">
          {card.cta}
          <ArrowRight className="h-4 w-4" />
        </LinkButton>
      </div>
    </motion.article>
  );
}

function AppComingSoonSection() {
  return (
    <section className="defer-render bg-white py-8 sm:py-10">
      <div className="section-wrap">
        <div className="smart-card-grid grid gap-4 rounded-fleet border border-white/70 bg-white/70 p-4 shadow-[0_14px_34px_rgba(8,17,31,0.1)] backdrop-blur-2xl sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Mobile app</span>
            <h2 className="mt-3 text-2xl font-black leading-tight text-fleet-night sm:text-4xl">Mobile apps are coming soon</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Use the web platform while customer, rider, and business apps are prepared for release.
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
