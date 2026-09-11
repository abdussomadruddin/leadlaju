const CACHE_NAME = "leadlaju-pwa-v20260911-live-sync-v68";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=20260911-live-sync-v68",
  "/app.js?v=20260911-live-sync-v68",
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

async function cacheLeadSnapshot(payload = {}) {
  if (!payload.leadId || !payload.leadSnapshot) return;
  const cache = await caches.open("leadlaju-notification-snapshots");
  await cache.put(
    new Request(new URL(`/__lead_snapshot__/${encodeURIComponent(payload.leadId)}`, self.location.origin)),
    new Response(JSON.stringify(payload.leadSnapshot), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function showLeadNotification(payload = {}) {
  await cacheLeadSnapshot(payload);
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
      leadId: payload.leadId || null,
      leadSnapshot: payload.leadSnapshot || null,
      view: payload.view || null,
      reminderType: payload.reminderType || null,
      potentialCount: Number(payload.potentialCount) || 0,
    }
  };
  if (String(options.tag).startsWith("leadlaju-active-")) {
    const existing = await self.registration.getNotifications();
    existing
      .filter((notification) =>
        notification.tag.startsWith("leadlaju-lead-") ||
        notification.tag === options.tag,
      )
      .forEach((notification) => notification.close());
  }
  await self.registration.showNotification(title, options);
}

async function broadcastLeadSnapshot(payload = {}) {
  if (!payload.leadId || !payload.leadSnapshot) return;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({
    type: "LEAD_SNAPSHOT",
    leadId: payload.leadId,
    leadSnapshot: payload.leadSnapshot,
  }));
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type === "LEAD_NOTIFICATION") {
    event.waitUntil(Promise.all([
      showLeadNotification(event.data.payload),
      broadcastLeadSnapshot(event.data.payload),
    ]));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() };
  }
  event.waitUntil(Promise.all([
    showLeadNotification(payload),
    broadcastLeadSnapshot(payload),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notificationData = event.notification.data || {};
  const targetUrl = new URL(notificationData.url || "/", self.location.origin).href;
  const view = notificationData.view || null;

  event.waitUntil(
    (async () => {
      await cacheLeadSnapshot(notificationData);
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existingClient = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existingClient) {
        await existingClient.focus();
        existingClient.postMessage({
          type: notificationData.reminderType === "potential"
            ? "OPEN_POTENTIAL_REMINDER"
            : notificationData.leadId ? "OPEN_DASHBOARD" : view ? "OPEN_VIEW" : "OPEN_DASHBOARD",
          view,
          leadId: notificationData.leadId || null,
          leadSnapshot: notificationData.leadSnapshot || null,
          potentialCount: Number(notificationData.potentialCount) || 0,
        });
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
