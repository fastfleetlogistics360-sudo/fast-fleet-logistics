"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA support is progressive; the app remains fully usable without it.
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
