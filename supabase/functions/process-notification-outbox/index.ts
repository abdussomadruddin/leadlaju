import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import webpush from "npm:web-push@3.6.7";

type ClaimedRow = {
  outbox_id: number;
  notification_type: string;
  payload: Record<string, unknown>;
  endpoint: string | null;
  p256dh: string | null;
  auth_secret: string | null;
  subscription_id: string | null;
  user_id: string;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const workerSecret = Deno.env.get("NOTIFICATION_WORKER_SECRET") || "";
  if (!workerSecret || request.headers.get("X-LeadLaju-Worker") !== workerSecret) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@leadlaju.my";
  if (!publicKey || !privateKey) return json({ ok: false, error: "VAPID is not configured" }, 503);
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await admin.rpc("claim_notification_outbox", { p_limit: 20 });
  if (error) return json({ ok: false, error: error.message }, 500);

  const groups = new Map<number, ClaimedRow[]>();
  for (const row of (data || []) as ClaimedRow[]) {
    groups.set(row.outbox_id, [...(groups.get(row.outbox_id) || []), row]);
  }

  let sent = 0;
  let failed = 0;
  for (const [outboxId, rows] of groups) {
    const first = rows[0];
    if (first.notification_type !== "new_lead") {
      const notification = JSON.stringify({
        title: String(first.payload?.title || "LeadLaju notification"),
        body: String(first.payload?.body || "Ada update baru dalam LeadLaju."),
        tag: String(first.payload?.tag || `leadlaju-${outboxId}`),
        renotify: first.payload?.renotify !== false,
        requireInteraction: first.payload?.requireInteraction !== false,
        icon: "/assets/icon-192.png",
        badge: "/assets/badge-96.png",
        url: String(first.payload?.url || "/"),
        view: first.payload?.view || null,
        reminderType: first.payload?.reminderType || null,
        potentialCount: Number(first.payload?.potentialCount) || 0,
      });
      let delivered = 0;
      const deliveryErrors: string[] = [];
      for (const row of rows) {
        if (!row.endpoint || !row.p256dh || !row.auth_secret) continue;
        try {
          await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } }, notification, { TTL: 300, urgency: "high" });
          delivered += 1;
          await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0, updated_at: new Date().toISOString() }).eq("id", row.subscription_id);
        } catch (cause) {
          const statusCode = Number((cause as { statusCode?: number })?.statusCode) || 0;
          deliveryErrors.push(`${statusCode || "push"}`);
          const patch: Record<string, unknown> = { last_failure_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          if (statusCode === 404 || statusCode === 410) patch.active = false;
          await admin.from("push_subscriptions").update(patch).eq("id", row.subscription_id);
        }
      }
      const noSubscription = rows.every((row) => !row.endpoint);
      const success = delivered > 0 || noSubscription;
      await admin.rpc("finish_notification_outbox", { p_outbox_id: outboxId, p_success: success, p_error: success ? null : `Push failed: ${deliveryErrors.join(",")}` });
      if (success) sent += 1; else failed += 1;
      continue;
    }
    const leadId = String(first.payload?.lead_id || "");
    const revision = Number(first.payload?.assignment_revision) || 0;
    const { data: lead, error: leadError } = await admin.from("leads")
      .select("id,name,phone,email,city,source,notes,status,queue_state,assigned_agent_id,received_at,expires_at,assignment_revision,status_revision,created_at,projects(name)")
      .eq("id", leadId).eq("assigned_agent_id", first.user_id).eq("assignment_revision", revision).maybeSingle();
    if (leadError || !lead) {
      await admin.rpc("finish_notification_outbox", {
        p_outbox_id: outboxId,
        p_success: false,
        p_error: leadError?.message || "Canonical assignment no longer exists",
      });
      failed += 1;
      continue;
    }

    const project = Array.isArray(lead.projects) ? lead.projects[0]?.name : (lead.projects as { name?: string } | null)?.name;
    const leadSnapshot = { ...lead, project: project || "", projects: undefined };
    const notification = JSON.stringify({
      title: `Lead baru: ${project || "Projek baru"}`,
      body: `${lead.name}\nNombor dibuka selepas CALL NOW.`,
      tag: `leadlaju-active-${first.user_id}`,
      renotify: true,
      requireInteraction: true,
      icon: "/assets/icon-192.png",
      badge: "/assets/badge-96.png",
      url: "/?view=leads",
      view: "leads",
      leadId: lead.id,
      leadSnapshot,
    });

    let delivered = 0;
    const deliveryErrors: string[] = [];
    for (const row of rows) {
      if (!row.endpoint || !row.p256dh || !row.auth_secret) continue;
      try {
        await webpush.sendNotification({
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth_secret },
        }, notification, { TTL: 300, urgency: "high" });
        delivered += 1;
        await admin.from("push_subscriptions").update({
          last_success_at: new Date().toISOString(), failure_count: 0, updated_at: new Date().toISOString(),
        }).eq("id", row.subscription_id);
      } catch (cause) {
        const statusCode = Number((cause as { statusCode?: number })?.statusCode) || 0;
        deliveryErrors.push(`${statusCode || "push"}`);
        const patch: Record<string, unknown> = {
          last_failure_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        if (statusCode === 404 || statusCode === 410) patch.active = false;
        await admin.from("push_subscriptions").update(patch).eq("id", row.subscription_id);
      }
    }

    const noSubscription = rows.every((row) => !row.endpoint);
    const success = delivered > 0 || noSubscription;
    await admin.rpc("finish_notification_outbox", {
      p_outbox_id: outboxId,
      p_success: success,
      p_error: success ? null : `Push failed: ${deliveryErrors.join(",")}`,
    });
    if (success) sent += 1;
    else failed += 1;
  }

  return json({ ok: true, claimed: groups.size, sent, failed });
});
