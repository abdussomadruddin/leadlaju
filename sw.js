const CACHE_NAME = "leadlaju-pwa-v20260625-mobile-safe-topbar-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=20260625-mobile-safe-topbar-v3",
  "/app.js?v=20260625-mobile-safe-topbar-v3",
  "/manifest.webmanifest?v=20260625-pwa-notifications",
  "/assets/icon.svg?v=20260625-pwa-notifications",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/maskable-512.png",
  "/assets/apple-touch-icon.png",
  "/assets/badge-96.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" || ["script", "style"].includes(request.destination)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") return response;
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") return response;
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match("/index.html"));
    }),
  );
});

async function showLeadNotification(payload = {}) {
  const title = payload.title || "Lead baru masuk";
  const options = {
    body: payload.body || "Lead baru perlu dihubungi dalam masa 5 minit.",
    tag: payload.tag || payload.leadId || "leadlaju-new-lead",
    renotify: true,
    requireInteraction: true,
    icon: payload.icon || "/assets/icon-192.png",
    badge: payload.badge || "/assets/badge-96.png",
    data: {
      url: payload.url || "/",
      leadId: payload.leadId || null
    }
  };
  await self.registration.showNotification(title, options);
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type === "LEAD_NOTIFICATION") {
    event.waitUntil(showLeadNotification(event.data.payload));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() };
  }
  event.waitUntil(showLeadNotification(payload));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existingClient) {
        existingClient.focus();
        existingClient.postMessage({ type: "OPEN_DASHBOARD", leadId: event.notification.data?.leadId || null });
        return;
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
