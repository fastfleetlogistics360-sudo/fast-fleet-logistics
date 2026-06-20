"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Megaphone } from "lucide-react";
import { enabledHubPromotionSlides, type HubPromotionSlide } from "@/lib/hub-promotion-slides";

export function HubPromotionCarousel({ slides: configuredSlides }: { slides?: HubPromotionSlide[] }) {
  const slides = enabledHubPromotionSlides(configuredSlides);
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (active < slides.length) return;
    setActive(0);
  }, [active, slides.length]);

  useEffect(() => {
    if (reduceMotion || paused || slides.length < 2) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, [paused, reduceMotion, slides.length]);

  if (!slides.length) return null;

  const slide = slides[active];
  const imageAvailable = Boolean(slide.image) && !failedImages.has(slide.id);

  return (
    <section className="mt-4" aria-label="Hub promotions" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div
        className="group relative block min-h-[196px] cursor-pointer overflow-hidden rounded-[18px] bg-fleet-night text-white shadow-[0_12px_28px_rgba(8,17,31,0.14)] focus:outline-none focus:ring-4 focus:ring-fleet-gold/20 sm:min-h-[220px]"
        role="link"
        tabIndex={0}
        onClick={() => router.push(slide.href)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") router.push(slide.href);
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_44%,rgba(27,117,187,0.46),transparent_36%),linear-gradient(110deg,#08111f_0%,#0f3460_54%,#09264b_100%)]" />
        <div className="absolute inset-y-0 right-0 w-[55%] bg-[linear-gradient(90deg,transparent,rgba(8,17,31,0.04))]" />
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={reduceMotion ? false : { opacity: 0, x: 10 }}
            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative grid min-h-[196px] grid-cols-[minmax(0,1.15fr)_minmax(118px,0.85fr)] items-center gap-2 p-5 sm:min-h-[220px] sm:p-6"
          >
            <div className="relative z-10 min-w-0">
              <span className="inline-flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.15em] text-fleet-gold sm:text-xs">
                <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-fleet-ember/25 text-fleet-gold"><Megaphone className="h-4 w-4" /></span>
                {slide.badgeText}
              </span>
              <h2 className="mt-4 max-w-sm text-2xl font-black leading-[1.05] text-white sm:text-3xl">{slide.title}</h2>
              <p className="mt-3 max-w-sm text-sm font-semibold leading-5 text-white/75 sm:text-base">{slide.description}</p>
            </div>
            <div className="relative z-10 flex h-full min-h-[146px] items-center justify-center self-stretch">
              {imageAvailable ? (
                <img
                  src={slide.image}
                  alt=""
                  className="h-full max-h-[182px] w-full max-w-[240px] object-contain object-center transition duration-300 group-hover:scale-[1.02]"
                  onError={() => setFailedImages((current) => new Set(current).add(slide.id))}
                />
              ) : (
                <span className="grid h-20 w-20 place-items-center rounded-full border border-white/15 bg-white/10 text-fleet-gold"><Megaphone className="h-8 w-8" /></span>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
        {slides.length > 1 ? (
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1.5" aria-label="Promotion slides">
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setActive(index);
                }}
                className={`h-2 rounded-full transition ${index === active ? "w-5 bg-fleet-ember" : "w-2 bg-white/45 hover:bg-white/75"}`}
                aria-label={`Show promotion ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
