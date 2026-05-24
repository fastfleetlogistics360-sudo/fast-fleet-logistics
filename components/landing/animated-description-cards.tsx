"use client";

import Image from "next/image";
import { useRef, useState, type UIEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DescriptionCard = {
  label: string;
  title: string;
  body: string;
  image: string;
  icon: LucideIcon;
};

type AnimatedDescriptionCardsProps = {
  eyebrow: string;
  title: string;
  body: string;
  cards: DescriptionCard[];
  children?: ReactNode;
  surface?: "dark" | "light";
};

const cardBlurDataURL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nOScgdmlld0JveD0nMCAwIDE2IDknIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzknIGZpbGw9JyNmNmY4ZmInLz48Y2lyY2xlIGN4PScxMicgY3k9JzInIHI9JzUnIGZpbGw9JyNmNGE2MmEnIG9wYWNpdHk9Jy4yMicvPjxjaXJjbGUgY3g9JzMnIGN5PSc3JyByPSc0JyBmaWxsPScjMGYzNDYwJyBvcGFjaXR5PScuMTgnLz48L3N2Zz4=";

export function AnimatedDescriptionCards({ eyebrow, title, body, cards, children, surface = "dark" }: AnimatedDescriptionCardsProps) {
  const reduceMotion = useReducedMotion();
  const dark = surface === "dark";
  const [activeCard, setActiveCard] = useState(0);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    const firstCard = cardRefs.current[0];
    if (!firstCard) return;
    const gap = 12;
    const nextIndex = Math.round(node.scrollLeft / (firstCard.offsetWidth + gap));
    setActiveCard(Math.max(0, Math.min(cards.length - 1, nextIndex)));
  }

  function goToCard(index: number) {
    cardRefs.current[index]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "start", block: "nearest" });
    setActiveCard(index);
  }

  return (
    <section className={dark ? "defer-render overflow-hidden bg-fleet-night py-9 text-white sm:py-12" : "defer-render overflow-hidden bg-white py-9 text-fleet-night sm:py-12"}>
      <div className="section-wrap">
        <motion.div
          className="max-w-3xl"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-gold">{eyebrow}</span>
          <h2 className={`mt-3 text-2xl font-black leading-tight sm:text-5xl ${dark ? "text-white" : "text-fleet-night"}`}>{title}</h2>
          <p className={`mt-4 max-w-2xl text-sm font-semibold leading-7 sm:text-base ${dark ? "text-white/[0.86]" : "text-slate-600"}`}>{body}</p>
        </motion.div>

        <div
          className="-mx-4 mt-7 flex snap-x gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
          onScroll={handleScroll}
        >
          {cards.map((card, index) => {
            const Icon = card.icon;

            return (
              <motion.article
                key={card.title}
                ref={(node) => {
                  cardRefs.current[index] = node;
                }}
                className="group relative w-[min(68vw,240px)] shrink-0 snap-start overflow-hidden rounded-fleet border border-white/70 bg-white/76 text-fleet-night shadow-[0_12px_28px_rgba(0,0,0,0.14)] outline-none backdrop-blur-2xl lg:w-auto"
                initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.97 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                whileHover={reduceMotion ? undefined : { y: -5 }}
                whileFocus={reduceMotion ? undefined : { y: -5 }}
                viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.56, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                tabIndex={0}
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-fleet-paper">
                  <Image
                    src={card.image}
                    alt=""
                    fill
                    className="object-cover object-center transition duration-700 group-hover:scale-[1.04]"
                    sizes="(min-width: 1024px) 33vw, 68vw"
                    quality={62}
                    loading="lazy"
                    placeholder="blur"
                    blurDataURL={cardBlurDataURL}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-fleet-night/18 via-transparent to-white/5" />
                  <motion.span
                    className="absolute left-2 top-2 inline-flex items-center gap-2 rounded-fleet bg-fleet-ember px-2.5 py-1.5 text-[0.64rem] font-black uppercase tracking-[0.12em] text-white shadow-[0_10px_22px_rgba(239,108,0,0.24)]"
                    animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
                    transition={{ duration: 3, delay: index * 0.18, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {card.label}
                  </motion.span>
                </div>

                <div className="p-3">
                  <h3 className="text-base font-black leading-tight text-fleet-night sm:text-lg">{card.title}</h3>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 sm:text-sm sm:leading-6">{card.body}</p>
                </div>

                <div className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-fleet-ember via-fleet-gold to-fleet-leaf transition duration-300 group-hover:scale-x-100 group-focus:scale-x-100" />
              </motion.article>
            );
          })}
        </div>
        <div className="mt-2 flex justify-center gap-2 lg:hidden" aria-label={`${eyebrow} card pages`}>
          {cards.map((card, index) => (
            <button
              key={card.title}
              type="button"
              aria-label={`Show ${card.title}`}
              onClick={() => goToCard(index)}
              className={cn("h-2 rounded-full transition-all", activeCard === index ? "w-6 bg-fleet-ember" : dark ? "w-2 bg-white/35" : "w-2 bg-slate-300")}
            />
          ))}
        </div>

        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </section>
  );
}
