"use client";

import { Capacitor } from "@capacitor/core";

/** Opens the provider checkout in Android's secure Custom Tab, not Chrome's
 * full browser UI. Bank and card providers can still hand off to their own
 * trusted app when required, then return through the verified app link. */
export async function openSecureCheckout(authorizationUrl: string) {
  if (!authorizationUrl) throw new Error("Payment checkout link is missing.");

  if (!Capacitor.isNativePlatform()) {
    window.location.assign(authorizationUrl);
    return;
  }

  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({
      url: authorizationUrl,
      presentationStyle: "fullscreen",
      toolbarColor: "#08111f"
    });
  } catch {
    // Never block a customer from paying because a device has a damaged or
    // outdated native plugin installation.
    window.location.assign(authorizationUrl);
  }
}

export async function closeSecureCheckout() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    // The payment callback still works when no Custom Tab is open.
  }
}
