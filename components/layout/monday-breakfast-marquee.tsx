"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatMondayBreakfastCountdown, mondayBreakfastTickerSnapshot } from "@/lib/monday-breakfast-clock";

export function MondayBreakfastMarquee() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const interval = window.setInterval(refresh, 1000);
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const campaign = useMemo(() => now ? mondayBreakfastTickerSnapshot(now) : null, [now]);
  const active = campaign?.state === "active";
  const countdown = campaign ? formatMondayBreakfastCountdown(campaign.remainingMs, !active) : "--d --h --m --s";
  const message = active
    ? <> <span className="ff-marquee-live">LIVE</span> <span>🔴 LIVE NOW! 🍳 MONDAY FREE BREAKFAST IS HERE! • ENJOY UP TO ₦3,000 OFF ELIGIBLE RESTAURANT MEALS • ⏳ OFFER ENDS IN: <b className="ff-marquee-clock" suppressHydrationWarning>{countdown}</b> • ORDER YOUR BREAKFAST NOW! ✨</span> </>
    : campaign?.state === "finished"
      ? <>🍳 MISSED BREAKFAST? WE’RE BACK NEXT MONDAY! • EVERY MONDAY, 10AM–12PM WAT • ⏳ NEXT BREAKFAST STARTS IN: <b className="ff-marquee-clock" suppressHydrationWarning>{countdown}</b> • ✨</>
      : <>🍳 MONDAY FREE BREAKFAST IS COMING! ✨ EVERY MONDAY • 10AM–12PM WAT • ⏳ BREAKFAST STARTS IN: <b className="ff-marquee-clock" suppressHydrationWarning>{countdown}</b> • YOUR MONDAY DESERVES A DELICIOUS START! • 🍽️</>;

  return (
    <aside className={`ff-breakfast-marquee ${active ? "is-live" : ""}`} aria-label="Monday Free Breakfast promotion. Opens Restaurants.">
      <Link href="/restaurants" className="ff-marquee-link" aria-label="Explore eligible restaurants for Monday Free Breakfast">
        <span className="ff-marquee-track" aria-hidden="true">
          <span className="ff-marquee-group">{message}</span>
          <span className="ff-marquee-group">{message}</span>
        </span>
        <span className="sr-only">Monday Free Breakfast. Available every Monday from 10 AM to 12 PM West Africa Time for eligible restaurant meals. Open Restaurants.</span>
      </Link>
    </aside>
  );
}
