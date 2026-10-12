"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { NATIVE_RETURN_SCHEME } from "@/lib/payments/native-payment-return";

const allowedHosts = new Set(["fastfleet.com.ng", "www.fastfleet.com.ng"]);
const allowedPaths = new Set(["/delivery/callback", "/payment/callback"]);

function paymentCallbackFromAppUrl(value: string) {
  try {
    const appUrl = new URL(value);
    if (appUrl.protocol !== `${NATIVE_RETURN_SCHEME}:` || appUrl.hostname !== "payment-return") return null;
    const callback = new URL(appUrl.searchParams.get("url") || "");
    if (callback.protocol !== "https:" || !allowedHosts.has(callback.hostname) || !allowedPaths.has(callback.pathname)) return null;
    return callback.toString();
  } catch {
    return null;
  }
}

/** Resume only an allow-listed callback in the authenticated native WebView. */
export function NativeAppUrlHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("App")) return;
    let stopped = false;
    const open = (url: string) => {
      const callback = paymentCallbackFromAppUrl(url);
      if (callback && !stopped) window.location.assign(callback);
    };
    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) open(launch.url);
    }).catch(() => undefined);
    const listener = App.addListener("appUrlOpen", ({ url }) => open(url));
    return () => {
      stopped = true;
      void listener.then((handle) => handle.remove()).catch(() => undefined);
    };
  }, []);

  return null;
}
