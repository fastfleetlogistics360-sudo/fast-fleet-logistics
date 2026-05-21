"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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

export function AnimatedDescriptionCards({ eyebrow, title, body, cards, children, surface = "dark" }: AnimatedDescriptionCardsProps) {
  const reduceMotion = useReducedMotion();
  const dark = surface === "dark";

  return (
    <section className={dark ? "overflow-hidden bg-fleet-night py-14 text-white sm:py-20" : "overflow-hidden bg-white py-14 text-fleet-night sm:py-20"}>
      <div className="section-wrap">
        <motion.div
          className="max-w-3xl"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-gold">{eyebrow}</span>
          <h2 className={`mt-3 text-3xl font-black leading-tight sm:text-5xl ${dark ? "text-white" : "text-fleet-night"}`}>{title}</h2>
          <p className={`mt-4 max-w-2xl text-sm font-semibold leading-7 sm:text-base ${dark ? "text-white/70" : "text-slate-600"}`}>{body}</p>
        </motion.div>

        <div className="-mx-4 mt-9 flex snap-x gap-4 overflow-x-auto px-4 pb-6 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(230px,1fr))] lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
          {cards.map((card, index) => {
            const Icon = card.icon;

            return (
              <motion.article
                key={card.title}
                className="group relative w-[min(82vw,370px)] shrink-0 snap-start overflow-hidden rounded-fleet border border-white/70 bg-white text-fleet-night shadow-[0_22px_55px_rgba(0,0,0,0.24)] outline-none lg:w-auto"
                initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.97 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                whileHover={reduceMotion ? undefined : { y: -8 }}
                whileFocus={reduceMotion ? undefined : { y: -8 }}
                viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.56, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                tabIndex={0}
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-fleet-paper">
                  <Image
                    src={card.image}
                    alt=""
                    fill
                    className="object-cover object-center transition duration-700 group-hover:scale-[1.04]"
                    sizes="(min-width: 1024px) 33vw, 82vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-fleet-night/18 via-transparent to-white/5" />
                  <motion.span
                    className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-fleet bg-fleet-ember px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white shadow-[0_12px_28px_rgba(239,108,0,0.28)]"
                    animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
                    transition={{ duration: 3, delay: index * 0.18, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Icon className="h-4 w-4" />
                    {card.label}
                  </motion.span>
                </div>

                <div className="p-4 sm:p-5">
                  <h3 className="text-xl font-black leading-tight text-fleet-night sm:text-2xl">{card.title}</h3>
                  <p className="mt-2 min-h-[3rem] text-sm font-semibold leading-6 text-slate-500">{card.body}</p>
                </div>

                <div className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-fleet-ember via-fleet-gold to-fleet-leaf transition duration-300 group-hover:scale-x-100 group-focus:scale-x-100" />
              </motion.article>
            );
          })}
        </div>

        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </section>
  );
}
