"use client";

export const SESSION_CLEARED = "SESSION_CLEARED";

const LEGACY_CHECKOUT_QUEUE_DATABASE = "fastfleet-offline-bookings-v1";
const PRIVATE_CACHE_PREFIXES = ["fastfleet-pages-", "fastfleet-private-", "fastfleet-auth-"];

export async function clearServiceWorkerSession() {
  if (typeof window === "undefined") return;

  await Promise.all([
    deleteLegacyCheckoutQueue(),
    clearPrivateWorkerCaches(),
    notifyServiceWorkers()
  ]);
}

async function notifyServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  const workers = new Set<ServiceWorker>();
  if (navigator.serviceWorker.controller) workers.add(navigator.serviceWorker.controller);
  for (const registration of registrations) {
    if (registration.active) workers.add(registration.active);
    if (registration.waiting) workers.add(registration.waiting);
    if (registration.installing) workers.add(registration.installing);
  }
  for (const worker of workers) worker.postMessage({ type: SESSION_CLEARED });
}

async function clearPrivateWorkerCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys().catch(() => []);
  await Promise.all(
    keys
      .filter((key) => PRIVATE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key))
  );
}

function deleteLegacyCheckoutQueue() {
  return new Promise<void>((resolve) => {
    if (!("indexedDB" in window)) {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(LEGACY_CHECKOUT_QUEUE_DATABASE);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}
