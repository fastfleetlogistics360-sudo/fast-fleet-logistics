"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPPORT_TURNSTILE_ACTION } from "@/lib/support/policy";

export type SupportChallengeState = {
  ready: boolean;
  required: boolean;
  token: string | null;
  error: string | null;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<TurnstileApi> | null = null;

export function SupportTurnstile({ onChange, resetSignal }: { onChange: (state: SupportChallengeState) => void; resetSignal: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const [identity, setIdentity] = useState<"loading" | "authenticated" | "anonymous">("loading");
  onChangeRef.current = onChange;

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!active) return;
        const nextIdentity = data.user ? "authenticated" : "anonymous";
        setIdentity(nextIdentity);
        onChangeRef.current({ ready: true, required: nextIdentity === "anonymous", token: null, error: null });
      })
      .catch(() => {
        if (!active) return;
        setIdentity("anonymous");
        onChangeRef.current({ ready: true, required: true, token: null, error: null });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (identity !== "anonymous" || !containerRef.current) return;
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
    if (!siteKey) {
      onChangeRef.current({ ready: false, required: true, token: null, error: "Anonymous support verification is not configured." });
      return;
    }

    let active = true;
    loadTurnstile()
      .then((turnstile) => {
        if (!active || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: SUPPORT_TURNSTILE_ACTION,
          theme: "light",
          callback: (token: string) => onChangeRef.current({ ready: true, required: true, token, error: null }),
          "expired-callback": () => onChangeRef.current({ ready: true, required: true, token: null, error: "Verification expired. Please try again." }),
          "error-callback": () => onChangeRef.current({ ready: true, required: true, token: null, error: "Verification could not be completed." })
        });
        onChangeRef.current({ ready: true, required: true, token: null, error: null });
      })
      .catch(() => {
        if (active) onChangeRef.current({ ready: false, required: true, token: null, error: "Verification could not be loaded." });
      });

    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [identity]);

  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    window.turnstile.reset(widgetIdRef.current);
    onChangeRef.current({ ready: true, required: true, token: null, error: null });
  }, [resetSignal]);

  if (identity === "authenticated") return null;
  return (
    <div className="grid gap-2">
      {identity === "loading" ? <span className="text-xs font-bold text-slate-500">Checking support verification…</span> : null}
      <div ref={containerRef} />
    </div>
  );
}

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-fastfleet-turnstile="true"]');
    const script = existing || document.createElement("script");
    const resolveApi = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile unavailable")));
    script.addEventListener("load", resolveApi, { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile unavailable")), { once: true });
    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.fastfleetTurnstile = "true";
      document.head.appendChild(script);
    }
  });
  return turnstileScriptPromise;
}
