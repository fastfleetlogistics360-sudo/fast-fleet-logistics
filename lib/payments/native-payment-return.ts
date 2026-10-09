"use client";

import { Capacitor } from "@capacitor/core";

const NATIVE_RETURN_SCHEME = "fastfleets360";
const NATIVE_RETURN_HOST = "payment-return";

/**
 * A Custom Tab has its own browser context. When Squad finishes there, hand
 * the callback URL back to the installed Android app instead of closing the
 * tab onto the stale checkout page. The native activity validates the URL
 * again before loading it in the authenticated Capacitor WebView.
 */
export function handOffExternalAndroidPaymentReturn(callbackUrl: string) {
  if (typeof window === "undefined" || Capacitor.isNativePlatform() || !/Android/i.test(navigator.userAgent)) return false;

  const callback = new URL(callbackUrl);
  if (callback.protocol !== "https:" || !["fastfleet.com.ng", "www.fastfleet.com.ng"].includes(callback.hostname)) return false;

  const destination = new URL(`${NATIVE_RETURN_SCHEME}://${NATIVE_RETURN_HOST}`);
  destination.searchParams.set("url", callback.toString());
  window.location.replace(destination.toString());
  return true;
}
