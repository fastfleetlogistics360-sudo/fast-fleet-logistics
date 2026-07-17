"use client";

import { useEffect } from "react";
import { clearServiceWorkerSession } from "@/lib/service-worker-session";
import { createClient } from "@/lib/supabase/client";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const supabase = createClient();
    let previousUserId: string | null | undefined;
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA support is progressive; the app remains fully usable without it.
      });
    }, 1000);

    void supabase.auth.getUser().then(({ data }) => {
      previousUserId = data.user?.id || null;
    });
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id || null;
      if (event !== "INITIAL_SESSION" && previousUserId !== nextUserId) {
        void clearServiceWorkerSession();
      }
      previousUserId = nextUserId;
    });

    return () => {
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
