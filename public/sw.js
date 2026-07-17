const CACHE_NAME = "fastfleet-public-shell-v15";
const LEGACY_CHECKOUT_QUEUE_DATABASE = "fastfleet-offline-bookings-v1";
const SESSION_CLEARED = "SESSION_CLEARED";
const PRIVATE_CACHE_PREFIXES = ["fastfleet-pages-", "fastfleet-private-", "fastfleet-auth-"];
const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.webmanifest?v=20260713",
  "/brand/fastfleet-logo-2026-header.png?v=20260717",
  "/icons/icon-180.png?v=20260713",
  "/icons/icon-192.png?v=20260713",
  "/icons/icon-512.png?v=20260713"
];
const SAFE_PUBLIC_PAGE_PATHS = new Set(["/", "/about", "/cookies", "/how-it-works", "/main", "/ndpr", "/offline", "/privacy", "/services", "/terms", "/updates"]);

self.addEventListener("install", (event) => {
  event.waitUntil(precachePublicShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([deleteObsoleteCaches(), deleteLegacyCheckoutQueue()]).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method !== "GET") {
    event.respondWith(fetch(request).catch(() => offlineMutationResponse(url)));
    return;
  }

  if (isPrivateRequest(url.pathname)) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(async () => {
        if (!SAFE_PUBLIC_PAGE_PATHS.has(url.pathname)) return Response.error();
        return (await caches.match("/offline")) || Response.error();
      })
    );
    return;
  }

  if (isSafePublicAsset(url, request)) {
    event.respondWith(cachePublicAsset(request));
  }
});

self.addEventListener("message", (event) => {
  if (!isSessionClearedMessage(event.data)) return;
  event.waitUntil(clearSessionState());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Fast Fleets 360";
  const data = payload.data || payload.metadata || { url: "/hub" };
  const tag = payload.tag || data.tag || data.delivery_code || data.order_code || data.delivery_id || data.order_id || "fastfleet-update";
  const options = {
    body: payload.body || "You have a new Fast Fleets 360 update.",
    icon: payload.icon || "/icons/icon-192.png?v=20260713",
    badge: payload.badge || "/icons/icon-180.png?v=20260713",
    tag: String(tag).slice(0, 64),
    renotify: payload.renotify !== false,
    timestamp: Date.now(),
    data,
    actions: data.url
      ? [
          {
            action: "open",
            title: "Open tracking"
          }
        ]
      : []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = safeNotificationPath(event.notification.data?.url);
  const absoluteUrl = new URL(targetPath, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(absoluteUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(absoluteUrl);
    })
  );
});

async function cachePublicAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheablePublicResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

function isSafePublicAsset(url, request) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname === "/manifest.webmanifest") return true;
  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) return true;
  return ["script", "style", "font"].includes(request.destination) && url.pathname.startsWith("/_next/");
}

function isCacheablePublicResponse(response) {
  if (!response || !response.ok || response.type === "opaque") return false;
  const cacheControl = String(response.headers.get("Cache-Control") || "").toLowerCase();
  const vary = String(response.headers.get("Vary") || "").toLowerCase();
  return !cacheControl.includes("no-store")
    && !cacheControl.includes("private")
    && !vary.includes("cookie")
    && !vary.includes("authorization")
    && !response.headers.has("Set-Cookie");
}

function isPrivateRequest(pathname) {
  return pathname.startsWith("/api/")
    || pathname.startsWith("/account")
    || pathname.startsWith("/admin")
    || pathname.startsWith("/business/")
    || pathname.startsWith("/customer/")
    || pathname.startsWith("/dashboard")
    || pathname.startsWith("/delivery/")
    || pathname === "/hub"
    || pathname === "/choose-account-type"
    || pathname.startsWith("/rider/")
    || pathname.startsWith("/wallet")
    || pathname.startsWith("/book")
    || pathname.startsWith("/marketplace/")
    || pathname.startsWith("/auth");
}

function offlineMutationResponse(url) {
  const isCheckout = url.pathname.includes("/checkout") || url.pathname.includes("/payments/") || url.pathname.includes("/wallet/");
  const error = isCheckout ? "You're offline. Reconnect and confirm your checkout again." : "You're offline. Reconnect and try again.";
  return new Response(JSON.stringify({ error }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

async function precachePublicShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    APP_SHELL.map(async (path) => {
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (isCacheablePublicResponse(response)) await cache.put(path, response);
      } catch {
        // Installation remains available if one public asset is temporarily unavailable.
      }
    })
  );
}

async function deleteObsoleteCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
}

async function clearSessionState() {
  await Promise.all([clearPrivateCaches(), deleteLegacyCheckoutQueue()]);
}

async function clearPrivateCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => PRIVATE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key))
  );
}

function deleteLegacyCheckoutQueue() {
  return new Promise((resolve) => {
    if (!("indexedDB" in self)) {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(LEGACY_CHECKOUT_QUEUE_DATABASE);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

function isSessionClearedMessage(data) {
  return Boolean(
    data
      && typeof data === "object"
      && !Array.isArray(data)
      && data.type === SESSION_CLEARED
      && Object.keys(data).length === 1
  );
}

function safeNotificationPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/hub";
  try {
    const destination = new URL(value, self.location.origin);
    if (destination.origin !== self.location.origin) return "/hub";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/hub";
  }
}
