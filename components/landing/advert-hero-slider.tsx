"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bike, ChevronLeft, ChevronRight, LocateFixed, MapPinned, PackageCheck, Radar, ShieldCheck } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { enabledMainHeroSlides, type MainHeroSlide, type MainHeroSlideIcon } from "@/lib/main-hero-slides";

const iconComponents: Record<MainHeroSlideIcon, typeof PackageCheck> = {
  MapPinned,
  Bike,
  Radar,
  ShieldCheck,
  PackageCheck
};

export function AdvertHeroSlider({ slides: configuredSlides }: { slides?: MainHeroSlide[] }) {
  const slides = enabledMainHeroSlides(configuredSlides);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const slide = slides[active];
  const Icon = iconComponents[slide.icon] || PackageCheck;
  const [loadedSlides, setLoadedSlides] = useState(() => new Set([0]));

  useEffect(() => {
    if (active < slides.length) return;
    setActive(0);
  }, [active, slides.length]);

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
  }, [paused, reduceMotion, slides.length]);

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
          <img
            key={`${item.id}-${item.image}`}
            src={item.image}
            alt=""
            loading={index === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 h-full w-full object-cover object-center transition-[opacity,transform] duration-1000 will-change-transform ${
              active === index ? "scale-100 opacity-100" : "scale-[1.02] opacity-0"
            }`}
            aria-hidden="true"
          />
        ) : null
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,31,0.76),rgba(8,17,31,0.48)_48%,rgba(8,17,31,0.18)),linear-gradient(180deg,rgba(8,17,31,0.08),rgba(8,17,31,0.58))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(244,166,42,0.18),transparent_32%)]" />

      <div className="section-wrap relative z-10 grid min-h-[calc(100svh-76px)] content-center py-12 sm:py-16">
        <div className="max-w-4xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${slide.id}-${slide.title}`}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-fleet-gold backdrop-blur-xl">
                <Icon className="h-4 w-4" />
                {slide.badgeText}
              </span>
              <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[0.96] text-white drop-shadow-[0_3px_18px_rgba(0,0,0,0.45)] sm:text-6xl lg:text-7xl">
                {slide.title}
              </h1>
              <p className="mt-4 max-w-2xl text-xl font-black leading-7 text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.45)] sm:text-2xl">
                {slide.subtitle}
              </p>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] sm:text-lg">
                {slide.description}
              </p>
            </motion.div>
          </AnimatePresence>

          <motion.div
            className="mt-8 flex flex-col gap-3 sm:flex-row"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.48 }}
          >
            <LinkButton href={slide.primaryButtonHref} size="lg">
              {slide.primaryButtonLabel}
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
            <LinkButton href={slide.secondaryButtonHref} variant="secondary" size="lg">
              <LocateFixed className="h-4 w-4" />
              {slide.secondaryButtonLabel}
            </LinkButton>
            <LinkButton href={slide.tertiaryButtonHref} variant="dark" size="lg">
              <Bike className="h-4 w-4" />
              {slide.tertiaryButtonLabel}
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
                  key={item.id}
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
