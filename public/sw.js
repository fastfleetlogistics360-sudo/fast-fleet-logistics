const CACHE_NAME = "fastfleet-shell-v11";
const PAGES_CACHE = "fastfleet-pages-v11";
const OFFLINE_QUEUE = "fastfleet-offline-bookings-v1";
const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/brand/fastfleet-logo-2026-header.png",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![CACHE_NAME, PAGES_CACHE].includes(key)).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

async function trimPagesCache() {
  const cache = await caches.open(PAGES_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - 10)).map((request) => cache.delete(request)));
}

async function queueOfflineBooking(request) {
  const body = await request.clone().text();
  const db = await openQueueDb();
  await dbPut(db, { url: request.url, body, headers: Array.from(request.headers.entries()), createdAt: Date.now() });
  if ("registration" in self && "sync" in self.registration) {
    await self.registration.sync.register("fastfleet-offline-bookings");
  }
}

async function replayOfflineBookings() {
  const db = await openQueueDb();
  const queue = await dbAll(db);
  for (const item of queue) {
    try {
      await fetch(item.url, { method: "POST", headers: item.headers, body: item.body });
      await dbDelete(db, item.id);
    } catch {
      // Keep failed items queued for the next sync.
    }
  }
}

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("bookings", { keyPath: "id", autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbPut(db, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("bookings", "readwrite");
    tx.objectStore("bookings").add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function dbAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("bookings", "readonly");
    const request = tx.objectStore("bookings").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbDelete(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("bookings", "readwrite");
    tx.objectStore("bookings").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname.includes("/api/marketplace/checkout")) {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        await queueOfflineBooking(request);
        return new Response(JSON.stringify({ queued: true }), { headers: { "Content-Type": "application/json" } });
      })
    );
    return;
  }

  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin")) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.startsWith("/_next/") || ["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          const cache = await caches.open(PAGES_CACHE);
          await cache.put(request, response.clone());
          await trimPagesCache();
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/offline")) || Response.error())
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "fastfleet-offline-bookings") {
    event.waitUntil(replayOfflineBookings());
  }
});
