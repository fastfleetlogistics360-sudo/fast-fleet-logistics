"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const consentKey = "fastfleet.cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(consentKey) !== "accepted");
    } catch {
      setVisible(false);
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(consentKey, "accepted");
    } catch {
      // Consent storage is best effort; the banner can still close.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-24 z-[90] mx-auto max-w-3xl rounded-fleet border border-fleet-line bg-white/95 p-4 shadow-glow backdrop-blur-xl sm:bottom-5">
      <div className="flex gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fleet bg-fleet-night text-white">
          <Cookie className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-sm font-black text-fleet-night">FAST FLEETS360 uses cookies and browser storage.</strong>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
            We use essential storage for sign-in, delivery drafts, wallet preview, theme preference, and dashboard continuity. Read the{" "}
            <Link href="/cookies" className="text-fleet-ember underline">
              cookie notice
            </Link>
            .
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={accept}>
              Accept cookies
            </Button>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-fleet border border-fleet-line bg-white px-3 text-sm font-black text-fleet-night"
            >
              <X className="h-4 w-4" />
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
