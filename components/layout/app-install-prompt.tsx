"use client";

import { useEffect, useState } from "react";
import { Download, Share2, Smartphone, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

const dismissedUntilKey = "fastfleet_install_prompt_dismissed_until";
const installedKey = "fastfleet_install_prompt_installed";
const dismissMs = 1000 * 60 * 60 * 24 * 14;

function isStandaloneApp() {
  const capacitor = (window as Window & { Capacitor?: unknown }).Capacitor;
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true || Boolean(capacitor);
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function promptDismissed() {
  const dismissedUntil = Number(window.localStorage.getItem(dismissedUntilKey) || 0);
  return Number.isFinite(dismissedUntil) && dismissedUntil > Date.now();
}

export function AppInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosPrompt, setIosPrompt] = useState(false);

  useEffect(() => {
    if (isStandaloneApp() || window.localStorage.getItem(installedKey) || promptDismissed()) return;

    const ios = isIosDevice();
    setIosPrompt(ios);

    const showTimer = window.setTimeout(() => {
      if (ios && !promptDismissed() && !isStandaloneApp()) setVisible(true);
    }, 3500);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      window.setTimeout(() => {
        if (!promptDismissed() && !isStandaloneApp()) setVisible(true);
      }, 1200);
    }

    function handleInstalled() {
      window.localStorage.setItem(installedKey, "1");
      setVisible(false);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.clearTimeout(showTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!visible || (!deferredPrompt && !iosPrompt)) return null;

  function dismissPrompt() {
    window.localStorage.setItem(dismissedUntilKey, String(Date.now() + dismissMs));
    setVisible(false);
  }

  async function installApp() {
    if (!deferredPrompt) return;
    const promptEvent = deferredPrompt;
    setDeferredPrompt(null);
    await promptEvent.prompt().catch(() => undefined);
    const choice = await promptEvent.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (choice.outcome === "accepted") {
      window.localStorage.setItem(installedKey, "1");
      setVisible(false);
      return;
    }
    dismissPrompt();
  }

  return (
    <aside className="fixed inset-x-3 bottom-4 z-[90] mx-auto max-w-md rounded-[18px] border border-white/80 bg-white/95 p-4 text-fleet-night shadow-[0_24px_70px_rgba(8,17,31,0.24)] ring-1 ring-fleet-line/40 backdrop-blur-xl sm:bottom-5">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-fleet-night text-white">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-fleet-night">Install Fast Fleets 360</h2>
              <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">
                {iosPrompt ? "Add Fast Fleets 360 to your phone for quick access." : "Save Fast Fleets 360 to your phone app menu."}
              </p>
            </div>
            <button type="button" aria-label="Dismiss install prompt" className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-fleet-paper text-slate-600 transition hover:text-fleet-night" onClick={dismissPrompt}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {iosPrompt ? (
            <div className="mt-3 flex items-center gap-2 rounded-[14px] bg-fleet-paper px-3 py-2 text-xs font-black text-fleet-night">
              <Share2 className="h-4 w-4 text-fleet-ember" />
              Tap Share, then Add to Home Screen.
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-[14px] bg-fleet-ember px-4 text-sm font-black text-white transition hover:bg-[#f47e18]" onClick={() => void installApp()}>
                <Download className="h-4 w-4" />
                Install app
              </button>
              <button type="button" className="inline-flex min-h-10 items-center rounded-[14px] border border-fleet-line bg-white px-4 text-sm font-black text-fleet-night transition hover:border-fleet-gold" onClick={dismissPrompt}>
                Maybe later
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
