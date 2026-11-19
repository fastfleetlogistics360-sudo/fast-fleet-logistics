"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { FastAiMascot } from "@/components/fast-ai/fast-ai-mascot";

const dismissedKey = "fast-ai-launcher-greeting-dismissed-v1";

export function FastAiLauncher() {
  const [showGreeting, setShowGreeting] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; bubble: boolean } | null>(null);
  const launcher = useRef<HTMLElement>(null);

  useEffect(() => {
    setShowGreeting(window.localStorage.getItem(dismissedKey) !== "1");
    const evaluate = () => {
      const width = window.innerWidth; const height = window.innerHeight;
      const mobile = window.matchMedia("(max-width: 1023px)").matches;
      const candidates = mobile
        ? [{ top: Math.round(height * 0.42), left: 12, bubble: true }, { top: 132, left: 12, bubble: false }, { top: Math.round(height * 0.5), left: 12, bubble: false }, { top: Math.round(height * 0.5), left: Math.max(12, width - 76), bubble: false }]
        : [{ top: Math.round(height * 0.42), left: 12, bubble: true }, { top: Math.round(height * 0.7), left: 12, bubble: false }];
      const canPlace = (candidate: { top: number; left: number; bubble: boolean }) => {
        const boxWidth = candidate.bubble ? 232 : 64; const boxHeight = 64;
        if (candidate.top < 80 || candidate.top + boxHeight > height - (mobile ? 92 : 12) || candidate.left + boxWidth > width - 8) return false;
        const points = [[candidate.left + 8, candidate.top + 8], [candidate.left + boxWidth - 8, candidate.top + 8], [candidate.left + 8, candidate.top + boxHeight - 8], [candidate.left + boxWidth - 8, candidate.top + boxHeight - 8]];
        return points.every(([x, y]) => !document.elementsFromPoint(x, y).some((node) => node instanceof Element && !launcher.current?.contains(node) && Boolean(node.closest("a,button,input,textarea,select,[role=button]"))));
      };
      setPosition(candidates.find(canPlace) || null);
    };
    const timer = window.setTimeout(evaluate, 250);
    evaluate(); window.addEventListener("resize", evaluate); window.addEventListener("orientationchange", evaluate); window.addEventListener("scroll", evaluate, true);
    return () => { window.clearTimeout(timer); window.removeEventListener("resize", evaluate); window.removeEventListener("orientationchange", evaluate); window.removeEventListener("scroll", evaluate, true); };
  }, []);

  function dismiss(event: React.MouseEvent) {
    event.preventDefault(); event.stopPropagation();
    window.localStorage.setItem(dismissedKey, "1"); setShowGreeting(false);
  }

  if (!position) return null;
  return (
    <aside ref={launcher} style={{ top: position.top, left: position.left }} className="fixed z-40 flex items-end gap-2" aria-label="FAST AI assistant">
      {showGreeting && position.bubble ? <a href="/fast-ai" className="relative w-40 rounded-[18px] border border-white/90 bg-white px-3 py-2.5 text-left shadow-[0_14px_32px_rgba(8,17,31,.15)] ring-1 ring-fleet-line/30 transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-fleet-gold/25"><span className="block text-sm font-black text-fleet-night">Hi, I’m FAST AI!</span><span className="mt-0.5 block text-xs font-semibold text-slate-600">Need a hand? Tap to chat.</span><span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-fleet-line bg-white text-slate-500 hover:text-fleet-night" onClick={dismiss} role="button" aria-label="Dismiss FAST AI greeting"><X className="h-3 w-3" /></span></a> : null}
      <a href="/fast-ai" aria-label="Open FAST AI" className="group rounded-full focus:outline-none focus:ring-4 focus:ring-fleet-gold/30"><FastAiMascot priority className="h-16 w-16 transition group-hover:-translate-y-1" /></a>
    </aside>
  );
}
