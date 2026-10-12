"use client";

import { Capacitor } from "@capacitor/core";

export const NATIVE_RETURN_SCHEME = "fastfleets360";
const NATIVE_RETURN_HOST = "payment-return";

/**
 * A Custom Tab has its own browser context. When Squad finishes there, hand
 * the callback URL back to the installed app instead of closing the browser
 * onto the stale checkout page. The native bridge validates the URL again
 * before loading it in the authenticated Capacitor WebView.
 */
export function handOffExternalNativePaymentReturn(callbackUrl: string) {
  if (typeof window === "undefined" || Capacitor.isNativePlatform() || !/(Android|iPhone|iPad|iPod)/i.test(navigator.userAgent)) return false;

  const callback = new URL(callbackUrl);
  if (callback.protocol !== "https:" || !["fastfleet.com.ng", "www.fastfleet.com.ng"].includes(callback.hostname)) return false;

  const destination = new URL(`${NATIVE_RETURN_SCHEME}://${NATIVE_RETURN_HOST}`);
  destination.searchParams.set("url", callback.toString());
  window.location.replace(destination.toString());
  return true;
}

// Preserve the Android export for native builds already in distribution.
export const handOffExternalAndroidPaymentReturn = handOffExternalNativePaymentReturn;
