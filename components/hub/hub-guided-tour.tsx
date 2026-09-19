"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";

export type HubTourStep = {
  id: string;
  title: string;
  description: string;
};

type Highlight = { top: number; left: number; width: number; height: number };

export function HubGuidedTour({ steps, onFinish }: { steps: HubTourStep[]; onFinish: () => void }) {
  const reduceMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const step = steps[stepIndex];

  useEffect(() => {
    if (!step) return;
    const element = document.querySelector<HTMLElement>(`[data-hub-tour-id="${step.id}"]`);
    if (!element) return;

    const updateHighlight = () => {
      const rect = element.getBoundingClientRect();
      setHighlight({ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 });
    };
    element.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    const frame = window.requestAnimationFrame(updateHighlight);
    window.addEventListener("resize", updateHighlight);
    window.addEventListener("scroll", updateHighlight, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateHighlight);
      window.removeEventListener("scroll", updateHighlight, true);
    };
  }, [reduceMotion, step]);

  if (!step || !highlight) return null;
  const paddedTop = Math.max(0, highlight.top);
  const paddedBottom = Math.max(0, window.innerHeight - (highlight.top + highlight.height));
  const paddedLeft = Math.max(0, highlight.left);
  const paddedRight = Math.max(0, window.innerWidth - (highlight.left + highlight.width));
  const isFinalStep = stepIndex === steps.length - 1;

  function finish() {
    void fetch("/api/hub/tour", { method: "POST" });
    onFinish();
  }

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="hub-tour-title">
      <div className="fixed left-0 top-0 w-full bg-slate-950/78 backdrop-blur-[2px]" style={{ height: paddedTop }} />
      <div className="fixed bottom-0 left-0 w-full bg-slate-950/78 backdrop-blur-[2px]" style={{ height: paddedBottom }} />
      <div className="fixed bg-slate-950/78 backdrop-blur-[2px]" style={{ top: paddedTop, left: 0, width: paddedLeft, height: highlight.height }} />
      <div className="fixed bg-slate-950/78 backdrop-blur-[2px]" style={{ top: paddedTop, right: 0, width: paddedRight, height: highlight.height }} />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="pointer-events-none fixed rounded-[22px] border-2 border-fleet-gold bg-white/10 shadow-[0_0_0_5px_rgba(255,255,255,0.18),0_20px_50px_rgba(0,0,0,0.30)]"
        style={highlight}
      />
      <AnimatePresence mode="wait">
        <motion.section
          key={step.id}
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] mx-auto max-w-md rounded-[25px] border border-white/15 bg-[#08111f]/[0.97] p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.42)] sm:bottom-6 sm:p-5"
        >
          <button type="button" onClick={finish} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Skip Hub tour">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 pr-10 text-[0.65rem] font-black uppercase tracking-[0.16em] text-fleet-gold">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-fleet-ember/20"><Sparkles className="h-4 w-4" /></span>
            Your Fast Fleets Hub
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-white/65">{stepIndex + 1} of {steps.length}</span>
            <div className="flex gap-1" aria-hidden="true">
              {steps.map((item, index) => <span key={item.id} className={`h-1.5 rounded-full transition-all ${index === stepIndex ? "w-5 bg-fleet-gold" : "w-1.5 bg-white/25"}`} />)}
            </div>
          </div>
          <h2 id="hub-tour-title" className="mt-4 text-2xl font-black leading-tight">{step.title}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-white/72">{step.description}</p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex === 0} className="inline-flex h-11 items-center gap-1.5 rounded-[14px] px-3 text-sm font-black text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button type="button" onClick={() => isFinalStep ? finish() : setStepIndex((current) => current + 1)} className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-fleet-gold px-4 text-sm font-black text-fleet-night shadow-[0_10px_24px_rgba(244,126,24,0.26)] transition hover:-translate-y-0.5">
              {isFinalStep ? "Finish tour" : "Next"} {!isFinalStep && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
          <button type="button" onClick={finish} className="mt-3 text-xs font-bold text-white/50 transition hover:text-white">Skip tour</button>
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
