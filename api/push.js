const webpush = require("web-push");

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BJRcHLhmZgPSdid007nVHluQhJY4MD3IlC-t0--hq2eWToRTovU_k5GZsEmmbJK596VHrj2N5ZMdUpzJX64F5R0";
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "z-wtPdZf06SViy_cK27pmpIWuCF9c9ht7wp9Tp_3tqI";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@leadlaju.my";
const PUSH_NOTIFY_SECRET = process.env.PUSH_NOTIFY_SECRET || "leadlaju-push-notify-v1";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function allowCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeSubscription(input) {
  if (!input || typeof input !== "object") return null;
  const endpoint = String(input.endpoint || "").trim();
  const p256dh = String(input.keys?.p256dh || input.p256dh || "").trim();
  const auth = String(input.keys?.auth || input.auth || "").trim();
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    expirationTime: input.expirationTime || null,
    keys: { p256dh, auth },
  };
}

function normalizeNotification(input = {}) {
  return {
    title: String(input.title || "LeadLaju notification").trim(),
    body: String(input.body || "Ada update baru dalam LeadLaju.").trim(),
    tag: String(input.tag || `leadlaju-${Date.now()}`).trim(),
    renotify: input.renotify !== false,
    requireInteraction: input.requireInteraction !== false,
    icon: input.icon || "/assets/icon-192.png",
    badge: input.badge || "/assets/badge-96.png",
    url: input.url || "/",
    view: input.view || null,
    leadId: input.leadId || null,
  };
}

module.exports = async function handler(request, response) {
  allowCors(response);
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      ok: true,
      publicKey: VAPID_PUBLIC_KEY,
    });
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  let payload = request.body || {};
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  if (String(payload.secret || "") !== PUSH_NOTIFY_SECRET) {
    response.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const subscriptions = Array.isArray(payload.subscriptions)
    ? payload.subscriptions.map(normalizeSubscription).filter(Boolean)
    : [];
  const notification = normalizeNotification(payload.notification);

  if (!subscriptions.length) {
    response.status(200).json({ ok: true, sent: 0, failed: 0, expired: [] });
    return;
  }

  const body = JSON.stringify(notification);
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(subscription, body, {
        TTL: Number(payload.ttl || 300),
        urgency: payload.urgency || "high",
      }),
    ),
  );

  const expired = [];
  let sent = 0;
  let failed = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      sent += 1;
      return;
    }
    failed += 1;
    const statusCode = result.reason?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      expired.push(subscriptions[index].endpoint);
    }
  });

  response.status(200).json({ ok: true, sent, failed, expired });
};
