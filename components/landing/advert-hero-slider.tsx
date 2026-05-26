"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bike, ChevronLeft, ChevronRight, LocateFixed, MapPinned, PackageCheck, Radar, ShieldCheck } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

const slides = [
  {
    eyebrow: "Citywide delivery",
    title: "Fast delivery across your city",
    copy: "Move food, documents, retail parcels, and urgent packages with riders built for same-day movement.",
    image: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=1600&q=72",
    icon: MapPinned
  },
  {
    eyebrow: "Instant rider booking",
    title: "Book dispatch riders instantly",
    copy: "Set pickup and drop-off points, choose your delivery type, and get matched to nearby Fast Fleets 360 riders.",
    image: "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=1600&q=72",
    icon: Bike
  },
  {
    eyebrow: "Live tracking",
    title: "Track your delivery live",
    copy: "Follow rider movement, delivery status, and route updates from pickup to safe handoff.",
    image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1600&q=72",
    icon: Radar
  },
  {
    eyebrow: "Reliable package movement",
    title: "Send packages with confidence",
    copy: "Fast Fleets 360 keeps delivery fees clear, riders verified, and customers updated through every step.",
    image: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=1600&q=72",
    icon: ShieldCheck
  }
];

const blurDataURL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nOScgdmlld0JveD0nMCAwIDE2IDknIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzknIGZpbGw9JyMwODExMWYnLz48Y2lyY2xlIGN4PScxMicgY3k9JzInIHI9JzUnIGZpbGw9JyNlZjZjMDAnIG9wYWNpdHk9Jy4zNicvPjxjaXJjbGUgY3g9JzMnIGN5PSc3JyByPSc0JyBmaWxsPScjMGYzNDYwJyBvcGFjaXR5PScuNTUnLz48L3N2Zz4=";

export function AdvertHeroSlider() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const slide = slides[active];
  const Icon = slide.icon;
  const [loadedSlides, setLoadedSlides] = useState(() => new Set([0]));

  useEffect(() => {
    setLoadedSlides((current) => {
      if (current.has(active)) return current;
      const next = new Set(current);
      next.add(active);
      return next;
    });
  }, [active]);

  useEffect(() => {
    if (reduceMotion || paused) return;
    const timer = window.setInterval(() => {
      setActive((value) => (value + 1) % slides.length);
    }, 6200);

    return () => window.clearInterval(timer);
  }, [paused, reduceMotion]);

  function goToOffset(offset: number) {
    setActive((value) => (value + offset + slides.length) % slides.length);
  }

  return (
    <section
      className="relative isolate min-h-[calc(100svh-76px)] overflow-hidden bg-fleet-night text-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {slides.map((item, index) =>
        loadedSlides.has(index) ? (
          <Image
            key={item.image}
            src={item.image}
            alt=""
            fill
            priority={index === 0}
            loading={index === 0 ? "eager" : "lazy"}
            quality={index === 0 ? 74 : 66}
            placeholder="blur"
            blurDataURL={blurDataURL}
            sizes="100vw"
            className={`absolute inset-0 object-cover object-center transition-[opacity,transform] duration-1000 will-change-transform ${
              active === index ? "scale-100 opacity-100" : "scale-[1.02] opacity-0"
            }`}
            aria-hidden="true"
          />
        ) : null
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,31,0.98),rgba(8,17,31,0.82)_46%,rgba(8,17,31,0.46)),linear-gradient(180deg,rgba(8,17,31,0.16),rgba(8,17,31,0.94))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(244,166,42,0.18),transparent_32%),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:auto,54px_54px,54px_54px]" />

      <div className="section-wrap relative z-10 grid min-h-[calc(100svh-76px)] content-center py-12 sm:py-16">
        <div className="max-w-4xl">
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
              <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[0.96] text-white sm:text-6xl lg:text-7xl">
                {slide.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] sm:text-lg">
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
            <LinkButton href="/book" size="lg">
              Book Delivery
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
            <LinkButton href="/track" variant="secondary" size="lg">
              <LocateFixed className="h-4 w-4" />
              Track Package
            </LinkButton>
            <LinkButton href="/auth?account=driver" variant="dark" size="lg">
              <Bike className="h-4 w-4" />
              Become a Rider
            </LinkButton>
          </motion.div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goToOffset(-1)}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white hover:text-fleet-night focus:outline-none focus:ring-4 focus:ring-fleet-gold/25"
                aria-label="Previous Fast Fleets 360 hero slide"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => goToOffset(1)}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white hover:text-fleet-night focus:outline-none focus:ring-4 focus:ring-fleet-gold/25"
                aria-label="Next Fast Fleets 360 hero slide"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {slides.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setActive(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    active === index ? "w-12 bg-fleet-gold" : "w-5 bg-white/45 hover:bg-white/75"
                  }`}
                  aria-label={`Show Fast Fleets 360 slide ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              ["24/7", "booking"],
              ["Live", "tracking"],
              ["Clear", "pricing"]
            ].map(([value, label]) => (
              <div key={label} className="rounded-fleet border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                <strong className="block text-2xl font-black text-white">{value}</strong>
                <span className="mt-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/[0.82]">
                  <PackageCheck className="h-3.5 w-3.5 text-fleet-gold" />
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
