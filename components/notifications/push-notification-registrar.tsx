"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type NativePushToken = {
  value?: string;
};

type NativePushPlugin = {
  requestPermissions?: () => Promise<{ receive?: string }>;
  register?: () => Promise<void>;
  addListener?: (event: "registration", callback: (token: NativePushToken) => void) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
};

declare global {
  interface Window {
    Capacitor?: {
      getPlatform?: () => string;
      Plugins?: {
        PushNotifications?: NativePushPlugin;
      };
    };
  }
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) output[index] = rawData.charCodeAt(index);
  return output;
}

async function saveSubscription(payload: Record<string, unknown>) {
  await fetch("/api/notifications/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => null);
}

async function showForegroundNotification(title: string, body: string, data?: Record<string, unknown>) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = {
    body,
    icon: "/icons/icon-192.png?v=20260629",
    badge: "/icons/icon-180.png?v=20260629",
    data
  };
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return;
    }
  } catch {
    // Browser foreground notification fallback below.
  }
  new Notification(title, options);
}

export function PushNotificationRegistrar() {
  useEffect(() => {
    let cancelled = false;
    let removeRealtimeChannel: (() => void) | undefined;
    let removeNativeRegistrationListener: (() => void) | undefined;

    async function registerNativePush() {
      const plugin = window.Capacitor?.Plugins?.PushNotifications;
      if (!plugin?.register) return;
      const permission = plugin.requestPermissions ? await plugin.requestPermissions().catch(() => null) : null;
      if (permission?.receive && permission.receive !== "granted") return;
      const listener = await plugin.addListener?.("registration", (token) => {
        if (!token.value) return;
        void saveSubscription({
          platform: window.Capacitor?.getPlatform?.() || "native",
          provider: "fcm",
          token: token.value,
          endpoint: `fcm:${token.value}`,
          keys: { token: token.value }
        });
      });
      removeNativeRegistrationListener = () => {
        void Promise.resolve(listener?.remove?.()).catch(() => null);
      };
      await plugin.register().catch(() => null);
    }

    async function registerWebPush() {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission().catch(() => "denied");
      if (permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready.catch(() => null);
      if (!registration?.pushManager) return;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }));
      const json = subscription.toJSON();
      await saveSubscription({
        platform: "web",
        provider: "web_push",
        endpoint: subscription.endpoint,
        keys: json.keys || {}
      });
    }

    async function setupForUser() {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      void registerNativePush();
      void registerWebPush();

      const channel = supabase
        .channel(`foreground-notifications:${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const row = payload.new as { title?: string; body?: string; metadata?: Record<string, unknown> };
            if (!row.title || !row.body) return;
            void showForegroundNotification(row.title, row.body, row.metadata);
          }
        )
        .subscribe();
      removeRealtimeChannel = () => {
        supabase.removeChannel(channel);
      };
    }

    void setupForUser();
    return () => {
      cancelled = true;
      removeRealtimeChannel?.();
      removeNativeRegistrationListener?.();
    };
  }, []);

  return null;
}
