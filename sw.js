const CACHE_NAME = "leadlaju-pwa-v20260912-lead-monitor-v72";
const LEAD_HANDOFF_CACHE = "leadlaju-notification-snapshots";
const LEAD_HANDOFF_SCHEMA_VERSION = 1;
const LEAD_NOTIFICATION_HOLD_MS = 15000;
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=20260912-lead-monitor-v72",
  "/app.js?v=20260912-lead-monitor-v72",
  "/manifest.webmanifest?v=20260625-pwa-notifications",
  "/assets/icon.svg?v=20260625-pwa-notifications",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/maskable-512.png",
  "/assets/apple-touch-icon.png",
  "/assets/badge-96.png"
];

function leadTimingKey(payload = {}) {
  const snapshot = payload.leadSnapshot || {};
  const leadId = String(payload.leadId || snapshot.id || "").trim();
  const revision = Number(snapshot.assignment_revision ?? snapshot.assignmentRevision) || 0;
  return `${leadId}:${revision}`;
}

function createLeadTiming(payload = {}) {
  return { key: leadTimingKey(payload) };
}

function logLeadTiming(eventName, timing = {}) {
  console.log(`[LeadLajuTiming] ${JSON.stringify({
    event: eventName,
    key: timing.key || "",
    swPushEpoch: Number(timing.swPushEpoch) || null,
    swBroadcastStartEpoch: Number(timing.swBroadcastStartEpoch) || null,
    swBroadcastCompleteEpoch: Number(timing.swBroadcastCompleteEpoch) || null,
  })}`);
}

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
      .then((keys) => Promise.all(keys.filter((key) => ![CACHE_NAME, LEAD_HANDOFF_CACHE].includes(key)).map((key) => caches.delete(key))))
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

function leadHandoffIdentity(payload = {}) {
  const snapshot = payload.leadSnapshot || {};
  const agentId = String(snapshot.assigned_agent_id || snapshot.assignedAgentId || "").trim();
  const leadId = String(payload.leadId || snapshot.id || "").trim();
  const revision = Number(snapshot.assignment_revision ?? snapshot.assignmentRevision) || 0;
  if (!agentId || !leadId || revision < 1) return null;
  return {
    agentId,
    leadId,
    revision,
    key: `${agentId}:${leadId}:${revision}`,
    path: `/__lead_handoff__/v${LEAD_HANDOFF_SCHEMA_VERSION}/${encodeURIComponent(agentId)}/${encodeURIComponent(leadId)}/${revision}`,
  };
}

async function cacheLeadSnapshot(payload = {}) {
  if (!payload.leadId || !payload.leadSnapshot) return null;
  const cache = await caches.open(LEAD_HANDOFF_CACHE);
  const identity = leadHandoffIdentity(payload);
  if (identity) {
    await cache.put(
      new Request(new URL(identity.path, self.location.origin)),
      new Response(JSON.stringify({
        schemaVersion: LEAD_HANDOFF_SCHEMA_VERSION,
        handoffKey: identity.key,
        assignedAgentId: identity.agentId,
        leadId: identity.leadId,
        assignmentRevision: identity.revision,
        createdAt: Date.now(),
        leadSnapshot: payload.leadSnapshot,
      }), { headers: { "Content-Type": "application/json" } }),
    );
  }
  await cache.put(
    new Request(new URL(`/__lead_snapshot__/${encodeURIComponent(payload.leadId)}`, self.location.origin)),
    new Response(JSON.stringify(payload.leadSnapshot), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  return identity;
}

async function replayLeadHandoffs(client, agentId) {
  if (!client || !agentId) return;
  const cache = await caches.open(LEAD_HANDOFF_CACHE);
  const requests = await cache.keys();
  const handoffs = [];
  for (const request of requests) {
    if (!new URL(request.url).pathname.startsWith(`/__lead_handoff__/v${LEAD_HANDOFF_SCHEMA_VERSION}/`)) continue;
    const response = await cache.match(request);
    if (!response) continue;
    try {
      const handoff = await response.json();
      if (handoff?.schemaVersion !== LEAD_HANDOFF_SCHEMA_VERSION || handoff.assignedAgentId !== agentId) continue;
      handoffs.push(handoff);
    } catch {
      await cache.delete(request);
    }
  }
  handoffs
    .sort((left, right) => {
      const leftTime = Date.parse(left.leadSnapshot?.received_at || left.leadSnapshot?.receivedAt || "") || 0;
      const rightTime = Date.parse(right.leadSnapshot?.received_at || right.leadSnapshot?.receivedAt || "") || 0;
      return rightTime - leftTime || Number(right.createdAt || 0) - Number(left.createdAt || 0);
    })
    .forEach((handoff) => client.postMessage({ type: "LEAD_ASSIGNMENT_HANDOFF", ...handoff }));
}

async function acknowledgeLeadHandoff(data = {}) {
  const key = String(data.handoffKey || "").trim();
  if (!key) return;
  const cache = await caches.open(LEAD_HANDOFF_CACHE);
  const requests = await cache.keys();
  let acknowledged = null;
  for (const request of requests) {
    if (!new URL(request.url).pathname.startsWith(`/__lead_handoff__/v${LEAD_HANDOFF_SCHEMA_VERSION}/`)) continue;
    const response = await cache.match(request);
    if (!response) continue;
    try {
      const handoff = await response.json();
      if (handoff?.handoffKey !== key) continue;
      acknowledged = handoff;
      await cache.delete(request);
      break;
    } catch {
      await cache.delete(request);
    }
  }
  if (!acknowledged) return;
  const leadId = String(acknowledged.leadId || "").trim();
  const revision = Number(acknowledged.assignmentRevision) || 0;
  const legacyRequest = new Request(new URL(`/__lead_snapshot__/${encodeURIComponent(leadId)}`, self.location.origin));
  const legacyResponse = await cache.match(legacyRequest);
  if (!legacyResponse) return;
  try {
    const snapshot = await legacyResponse.json();
    if (leadTimingKey({ leadId, leadSnapshot: snapshot }) === `${leadId}:${revision}`) await cache.delete(legacyRequest);
  } catch {
    await cache.delete(legacyRequest);
  }
}

async function showLeadNotification(payload = {}, timing = createLeadTiming(payload), config = {}) {
  logLeadTiming("SW_NOTIFICATION_START", timing);
  if (!config.snapshotCached) await cacheLeadSnapshot(payload);
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

function deliverLeadSnapshotToClient(client, message) {
  try {
    client.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

async function broadcastLeadSnapshot(payload = {}, timing = createLeadTiming(payload)) {
  if (!payload.leadId || !payload.leadSnapshot) return { clientCount: 0, readyCount: 0 };
  const identity = leadHandoffIdentity(payload);
  timing.swBroadcastStartEpoch = Date.now();
  logLeadTiming("SW_BROADCAST_START", timing);
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const message = {
    type: "LEAD_SNAPSHOT",
    leadId: payload.leadId,
    leadSnapshot: payload.leadSnapshot,
    handoffKey: identity?.key || null,
    timing: {
      key: timing.key,
      swPushEpoch: Number(timing.swPushEpoch) || null,
      swBroadcastStartEpoch: timing.swBroadcastStartEpoch,
      swBroadcastCompleteEpoch: null,
    },
  };
  const deliveredResults = clients.map((client) => deliverLeadSnapshotToClient(client, message));
  timing.swBroadcastCompleteEpoch = Date.now();
  logLeadTiming("SW_BROADCAST_COMPLETE", timing);
  clients.forEach((client) => client.postMessage({
    type: "LEAD_SNAPSHOT_TIMING",
    timing: {
      key: timing.key,
      swPushEpoch: Number(timing.swPushEpoch) || null,
      swBroadcastStartEpoch: timing.swBroadcastStartEpoch,
      swBroadcastCompleteEpoch: timing.swBroadcastCompleteEpoch,
    },
  }));
  return {
    clientCount: clients.length,
    deliveredClientCount: deliveredResults.filter(Boolean).length,
  };
}

async function deliverLeadNotification(payload = {}, timing = createLeadTiming(payload)) {
  await cacheLeadSnapshot(payload);
  await broadcastLeadSnapshot(payload, timing);
  await new Promise((resolve) => setTimeout(resolve, LEAD_NOTIFICATION_HOLD_MS));
  await showLeadNotification(payload, timing, { snapshotCached: true });
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type === "APP_READY_FOR_LEAD_ASSIGNMENT") {
    event.waitUntil(replayLeadHandoffs(event.source, String(event.data.agentId || "").trim()));
    return;
  }
  if (event.data?.type === "LEAD_ASSIGNMENT_HANDOFF_ACK") {
    event.waitUntil(acknowledgeLeadHandoff(event.data));
    return;
  }
  if (event.data?.type === "LEAD_NOTIFICATION") {
    const timing = createLeadTiming(event.data.payload);
    event.waitUntil(deliverLeadNotification(event.data.payload, timing));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const timing = createLeadTiming(payload);
  timing.swPushEpoch = Date.now();
  logLeadTiming("SW_PUSH", timing);
  event.waitUntil(deliverLeadNotification(payload, timing));
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
          handoffKey: leadHandoffIdentity(notificationData)?.key || null,
          potentialCount: Number(notificationData.potentialCount) || 0,
        });
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
