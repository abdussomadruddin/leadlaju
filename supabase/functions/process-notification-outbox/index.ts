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
    const brandId = String(first.payload?.brandId || "");
    const salesReminder = ["sales_contact_15", "sales_contact_60", "sales_contact_admin"].includes(first.notification_type);
    const canDeliver = async () => {
      if (!brandId) return false;
      const { data: brand } = await admin.from("brands").select("id").eq("id", brandId).eq("active", true).maybeSingle();
      const { data: recipient } = await admin.from("profiles").select("id").eq("id", first.user_id).eq("brand_id", brandId).eq("active", true).eq("approval_status", "approved").maybeSingle();
      if (!brand || !recipient) return false;
      if (salesReminder) {
        const { data, error } = await admin.rpc("validate_sales_contact_reminder", { p_user_id: first.user_id, p_type: first.notification_type, p_payload: first.payload });
        if (error) throw new Error(`Reminder validation failed: ${error.message}`);
        if (!data) return false;
        first.payload = data;
      }
      return true;
    };
    let allowed: boolean;
    try { allowed = await canDeliver(); } catch (cause) {
      await admin.rpc("finish_notification_outbox", { p_outbox_id: outboxId, p_success: false, p_error: String(cause) });
      failed += 1;
      continue;
    }
    if (!allowed) {
      await admin.rpc("finish_notification_outbox", { p_outbox_id: outboxId, p_success: true, p_error: null });
      continue;
    }
    const salesLead = first.notification_type === "sales_new_lead";
    if (first.notification_type !== "new_lead" && !salesLead) {
      if (first.notification_type === "follow_up_due") {
        const { data: countData, error: followUpError } = await admin
          .rpc("get_follow_up_notification_count", { p_agent_id: first.user_id });
        const count = Number(countData) || 0;
        if (followUpError || !count) {
          await admin.rpc("finish_notification_outbox", {
            p_outbox_id: outboxId,
            p_success: !followUpError,
            p_error: followUpError?.message || null,
          });
          if (followUpError) failed += 1;
          continue;
        }
        first.payload = {
          ...first.payload,
          body: `${count} lead perlu follow up.`,
          followUpDueCount: count,
        };
      }
      const notification = () => JSON.stringify({
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
        followUpDueCount: Number(first.payload?.followUpDueCount) || 0,
        bulletinId: first.payload?.bulletinId || null,
        leadId: first.payload?.leadId || null,
        brandId,
      });
      let delivered = 0;
      let cancelled = false;
      const deliveryErrors: string[] = [];
      for (const row of rows) {
        if (!row.endpoint || !row.p256dh || !row.auth_secret) continue;
        try {
          if (!await canDeliver()) { cancelled = true; break; }
          await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } }, notification(), { TTL: first.notification_type === "bulletin" ? 86400 : 300, urgency: first.notification_type === "bulletin" ? "normal" : "high" });
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
      const success = cancelled || delivered > 0 || (!salesReminder && noSubscription);
      await admin.rpc("finish_notification_outbox", { p_outbox_id: outboxId, p_success: success, p_error: success ? null : `Push failed: ${deliveryErrors.join(",")}` });
      if (success) sent += 1; else failed += 1;
      continue;
    }
    const leadId = String(first.payload?.lead_id || "");
    const revision = Number(first.payload?.assignment_revision) || 0;
    let leadQuery = admin.from("leads")
      // Both legacy and brand-scoped foreign keys exist; choose the brand-safe one.
      .select("id,brand_id,name,phone,email,city,source,notes,status,queue_state,assigned_agent_id,received_at,expires_at,assignment_revision,status_revision,created_at,projects!leads_project_id_fkey_brand(name)")
      .eq("brand_id", brandId)
      .eq("id", leadId)
      .eq("assigned_agent_id", first.user_id)
      .eq("assignment_revision", revision)
      .eq("status", "new")
      .eq("queue_state", salesLead ? "sales_assigned" : "active");
    if (!salesLead) leadQuery = leadQuery.gt("expires_at", new Date().toISOString());
    const { data: lead, error: leadError } = await leadQuery.maybeSingle();
    if (leadError || !lead) {
      await admin.rpc("finish_notification_outbox", {
        p_outbox_id: outboxId,
        p_success: !leadError,
        p_error: leadError?.message || null,
      });
      if (leadError) failed += 1;
      continue;
    }

    const project = Array.isArray(lead.projects) ? lead.projects[0]?.name : (lead.projects as { name?: string } | null)?.name;
    const leadSnapshot = { ...lead, project: project || "", projects: undefined };
    const notification = JSON.stringify({
      title: `Lead baru: ${project || "Projek baru"}`,
      body: salesLead ? `${lead.name}\nLead baharu tersedia untuk Call atau WhatsApp.` : `${lead.name}\nNombor dibuka selepas CALL NOW.`,
      tag: salesLead ? `leadlaju-sales-${lead.id}` : `leadlaju-active-${first.user_id}`,
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
      if (!await canDeliver()) break;
      try {
        await webpush.sendNotification({
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth_secret },
        }, notification, { TTL: salesLead ? 86400 : 300, urgency: "high" });
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

    // A lead is not delivered merely because its owner has no registered device yet.
    // Keep it retryable; each retry revalidates ownership/status/expiry above.
    const noSubscription = rows.every((row) => !row.endpoint || !row.p256dh || !row.auth_secret);
    const success = delivered > 0;
    await admin.rpc("finish_notification_outbox", {
      p_outbox_id: outboxId,
      p_success: success,
      p_error: success ? null : noSubscription ? "Waiting for active push subscription" : `Push failed: ${deliveryErrors.join(",")}`,
    });
    if (success) sent += 1;
    else failed += 1;
  }

  return json({ ok: true, claimed: groups.size, sent, failed });
});
