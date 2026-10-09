"use client";

import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { createClient } from "@/lib/supabase/client";

// Native FCM requires android/app/google-services.json in the installed binary.
// Keep it opt-in so native startup remains safe until Firebase is configured.
const nativePushEnabled = process.env.NEXT_PUBLIC_ENABLE_NATIVE_PUSH === "true";

type NativePushReadinessPlugin = {
  check: () => Promise<{ ready?: boolean }>;
};

// New Android binaries provide this small native preflight. Older installed
// binaries do not, which lets us safely skip FCM instead of calling Firebase
// before its google-services configuration has been compiled into the app.
const NativePushReadiness = registerPlugin<NativePushReadinessPlugin>("NativePushReadiness");

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
  const tag = typeof data?.tag === "string" ? data.tag : typeof data?.delivery_code === "string" ? `ff-${data.delivery_code}` : undefined;
  const options = {
    body,
    icon: "/icons/icon-192.png?v=20260713",
    badge: "/icons/icon-180.png?v=20260713",
    tag,
    renotify: Boolean(tag),
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

function announceDeliveryUpdate(data?: Record<string, unknown>) {
  if (!data || (!data.delivery_id && !data.order_id && !data.delivery_code && !data.order_code)) return;
  window.dispatchEvent(new CustomEvent("fastfleet:delivery-update", { detail: data }));
}

export function PushNotificationRegistrar() {
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let removeRealtimeChannel: (() => void) | undefined;
    let removeNativeRegistrationListener: (() => void) | undefined;
    let removeNativeRegistrationErrorListener: (() => void) | undefined;
    let removeNativeActionListener: (() => void) | undefined;
    let removeNativeNotificationListener: (() => void) | undefined;

    function openNotificationTarget(data?: Record<string, unknown>) {
      const url = typeof data?.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "";
      if (!url) return;
      window.location.assign(url);
    }

    async function registerNativePush(prompt = false) {
      // The app currently supports native FCM on Android only. Keeping the gate
      // explicit prevents an unconfigured native binary from prompting or crashing.
      if (!nativePushEnabled || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

      if (!Capacitor.isPluginAvailable("NativePushReadiness")) return;
      const readiness = await NativePushReadiness.check().catch(() => null);
      if (!readiness?.ready || cancelled) return;

      const currentPermission = await PushNotifications.checkPermissions().catch(() => null);
      if (!currentPermission || cancelled) return;
      const permission = prompt && currentPermission.receive === "prompt"
        ? await PushNotifications.requestPermissions().catch(() => null)
        : currentPermission;
      if (!permission || permission.receive !== "granted" || cancelled) return;

      await PushNotifications.createChannel({
          id: "delivery_updates",
          name: "Delivery updates",
          description: "Order, rider, package, and wallet delivery alerts.",
          importance: 5,
          visibility: 1,
          lights: true,
          vibration: true
        }).catch(() => null);
      const registrationListener = await PushNotifications.addListener("registration", (token) => {
        if (!token.value || cancelled) return;
        void saveSubscription({
          platform: "android",
          provider: "fcm",
          token: token.value,
          endpoint: `fcm:${token.value}`,
          keys: { token: token.value }
        });
      });
      removeNativeRegistrationListener = () => {
        void registrationListener.remove().catch(() => null);
      };
      const registrationErrorListener = await PushNotifications.addListener("registrationError", (error) => {
        // Do not retry permission or token registration in a loop: a broken Firebase
        // setup must not repeatedly destabilise a low-memory Android device.
        console.warn("Android push registration failed", error.error);
      });
      removeNativeRegistrationErrorListener = () => {
        void registrationErrorListener.remove().catch(() => null);
      };
      const actionListener = await PushNotifications.addListener("pushNotificationActionPerformed", (payload) => {
        openNotificationTarget(payload.notification?.data as Record<string, unknown> | undefined);
      });
      removeNativeActionListener = () => {
        void actionListener.remove().catch(() => null);
      };
      const notificationListener = await PushNotifications.addListener("pushNotificationReceived", (payload) => {
        announceDeliveryUpdate(payload.notification?.data as Record<string, unknown> | undefined);
      });
      removeNativeNotificationListener = () => {
        void notificationListener.remove().catch(() => null);
      };
      await PushNotifications.register().catch(() => null);
    }

    async function registerWebPush(prompt = false) {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
      const permission = Notification.permission === "granted" ? "granted" : prompt ? await Notification.requestPermission().catch(() => "denied") : "default";
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

    async function canAskForNotificationPermission() {
      if (nativePushEnabled && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
        if (!Capacitor.isPluginAvailable("NativePushReadiness")) return false;
        const readiness = await NativePushReadiness.check().catch(() => null);
        if (!readiness?.ready) return false;
        const permission = await PushNotifications.checkPermissions().catch(() => null);
        return permission?.receive === "prompt";
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      return Boolean(
        publicKey &&
          "serviceWorker" in navigator &&
          "PushManager" in window &&
          "Notification" in window &&
          Notification.permission === "default"
      );
    }

    async function setupForUser() {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      if (nativePushEnabled) void registerNativePush();
      void registerWebPush();

      // Android cannot create an FCM token until a user has acted on its
      // notification permission prompt. Offer that opt-in to every signed-in
      // role, rather than only when a rider turns online.
      void canAskForNotificationPermission().then((canAsk) => {
        if (canAsk && !cancelled) setShowPermissionPrompt(true);
      });

      const channel = supabase
        .channel(`foreground-notifications:${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const row = payload.new as { title?: string; body?: string; metadata?: Record<string, unknown> };
            if (!row.title || !row.body) return;
            announceDeliveryUpdate(row.metadata);
            void showForegroundNotification(row.title, row.body, row.metadata);
          }
        )
        .subscribe();
      removeRealtimeChannel = () => {
        supabase.removeChannel(channel);
      };
    }

    const requestPush = () => {
      if (nativePushEnabled) void registerNativePush(true);
      void registerWebPush(true);
    };
    window.addEventListener("fastfleet:request-push-notifications", requestPush);
    const setupTimer = window.setTimeout(() => void setupForUser(), 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(setupTimer);
      window.removeEventListener("fastfleet:request-push-notifications", requestPush);
      removeRealtimeChannel?.();
      removeNativeRegistrationListener?.();
      removeNativeRegistrationErrorListener?.();
      removeNativeActionListener?.();
      removeNativeNotificationListener?.();
    };
  }, []);

  if (!showPermissionPrompt) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:bottom-6" role="dialog" aria-label="Enable notifications">
      <p className="text-base font-black text-fleet-night">Stay updated</p>
      <p className="mt-1 text-sm font-medium leading-5 text-slate-600">Enable notifications for delivery, order, wallet, and account updates.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="min-h-10 rounded-lg px-3 text-sm font-bold text-slate-600" onClick={() => setShowPermissionPrompt(false)}>Not now</button>
        <button
          type="button"
          className="min-h-10 rounded-lg bg-fleet-night px-4 text-sm font-black text-white"
          onClick={() => {
            setShowPermissionPrompt(false);
            window.dispatchEvent(new Event("fastfleet:request-push-notifications"));
          }}
        >
          Enable notifications
        </button>
      </div>
    </div>
  );
}
