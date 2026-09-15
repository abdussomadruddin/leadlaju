import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

const allowedSheetPrefix = "https://script.google.com/macros/s/";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return ["active", "yes", "true", "1", "on"].includes(text(value).toLowerCase());
}

function status(value: unknown): string {
  const key = text(value).toLowerCase().replaceAll(" ", "_");
  const allowed = new Set(["new", "contacted", "passed", "all_offer_presented", "need_follow_up", "potential", "rejected", "cancelled", "client"]);
  return allowed.has(key) ? key : "new";
}

function queueState(value: unknown, leadStatus: string): string {
  const key = text(value).toLowerCase().replaceAll(" ", "_");
  const allowed = new Set(["queued", "active", "contacted", "passed", "all_offer_presented", "need_follow_up", "potential", "rejected", "cancelled", "client"]);
  if (allowed.has(key)) return key;
  return leadStatus === "new" ? "queued" : leadStatus;
}

function assignmentOutcome(value: unknown, isLatest: boolean, leadStatus: string, runtimeState: string): string {
  const key = text(value).toLowerCase().replaceAll(" ", "_");
  const allowed = new Set(["contacted", "missed", "passed", "all_offer_presented", "need_follow_up", "potential", "rejected", "cancelled", "client"]);
  if (key === "pending") {
    if (!isLatest) return "missed";
    if (leadStatus === "new" && runtimeState === "active") return "pending";
    return leadStatus === "new" ? "missed" : leadStatus;
  }
  return allowed.has(key) ? key : "missed";
}

function date(value: unknown, fallback = new Date().toISOString()): string {
  const raw = text(value);
  const malaysiaLocal = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw);
  const parsed = new Date(malaysiaLocal ? `${raw.replace(" ", "T")}+08:00` : raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

async function digest(value: string): Promise<string> {
  const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(data)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
 try {
  if (request.method !== "POST") return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  const suppliedKey = text(request.headers.get("X-LeadLaju-Key"));
  const body = await request.json().catch(() => ({}));
  const sheetEndpoint = text(body.sheet_endpoint);
  if (!suppliedKey || !sheetEndpoint.startsWith(allowedSheetPrefix) || !sheetEndpoint.endsWith("/exec")) {
    return Response.json({ ok: false, error: "Invalid migration request" }, { status: 400 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const keyDigest = await digest(suppliedKey);
  const { data: keyRecord } = await supabase.from("ingestion_api_keys").select("id")
    .eq("key_digest", keyDigest).eq("active", true).maybeSingle();
  if (!keyRecord) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sheetResponse = await fetch(sheetEndpoint, { redirect: "follow" });
  if (!sheetResponse.ok) return Response.json({ ok: false, error: `Sheet HTTP ${sheetResponse.status}` }, { status: 502 });
  const snapshot = await sheetResponse.json();
  const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
  const agents = Array.isArray(snapshot.agents) ? snapshot.agents : [];
  const leads = Array.isArray(snapshot.leads) ? snapshot.leads : [];
  const appointments = Array.isArray(snapshot.appointments) ? snapshot.appointments : [];
  const projectIds = new Map<string, string>();
  const agentIds = new Map<string, string>();
  const leadIds = new Map<string, string>();
  const assignmentRows: Record<string, unknown>[] = [];

  for (const item of projects) {
    const sourceId = text(item.id) || await digest(text(item.name));
    const { data, error } = await supabase.from("projects").upsert({
      source_project_id: sourceId, name: text(item.name), active: bool(item.active),
      created_at: date(item.created_at), updated_at: new Date().toISOString(),
    }, { onConflict: "source_project_id" }).select("id").single();
    if (error) throw error;
    projectIds.set(sourceId, data.id);
    projectIds.set(text(item.name).toLowerCase(), data.id);
  }

  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  for (const item of agents) {
    const email = text(item.email).toLowerCase();
    if (!email || !text(item.password)) continue;
    let user = listed.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (!user) {
      const created = await supabase.auth.admin.createUser({
        email, password: text(item.password), email_confirm: true,
        app_metadata: { role: text(item.role) === "admin" ? "admin" : "agent" },
      });
      if (created.error || !created.data.user) throw created.error || new Error("Auth user was not created");
      user = created.data.user;
    }
    const approved = bool(item.active);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id, source_agent_id: text(item.id), name: text(item.name), phone: text(item.phone), email,
      role: text(item.role) === "admin" ? "admin" : "agent",
      approval_status: approved ? "approved" : "pending", active: approved,
      leads_handled: Number(item.leads_handled) || 0,
      cooldown_until: text(item.cooldown_until) ? date(item.cooldown_until) : null,
      created_at: date(item.created_at), updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw error;
    agentIds.set(text(item.id), user.id);
    agentIds.set(email, user.id);
    await supabase.from("agent_availability").upsert({
      agent_id: user.id, lead_ready: bool(item.lead_ready), notification_ready: bool(item.notification_enabled),
      last_seen_at: text(item.last_seen_at) ? date(item.last_seen_at) : null,
      presence_lease_until: bool(item.lead_ready) ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null,
    });
    for (const sourceProjectId of Array.isArray(item.eligible_project_ids) ? item.eligible_project_ids : []) {
      const projectId = projectIds.get(text(sourceProjectId));
      if (projectId) await supabase.from("agent_project_eligibility").upsert({ agent_id: user.id, project_id: projectId });
    }
  }

  for (const item of leads) {
    const sourceLeadId = text(item.id);
    const leadStatus = status(item.status);
    const history = Array.isArray(item.assignment_history) ? item.assignment_history : [];
    const canonicalAssignmentRevision = Math.max(Number(item.assignment_revision) || 0, history.length);
    let runtimeState = queueState(item.queue_state, leadStatus);
    const projectId = projectIds.get(text(item.project).toLowerCase());
    if (!sourceLeadId || !projectId || !text(item.name) || !text(item.phone)) continue;
    const assignedAgentId = agentIds.get(text(item.assigned_agent_id)) || agentIds.get(text(item.assigned_agent_email).toLowerCase()) || null;
    if (runtimeState === "active" && !assignedAgentId) runtimeState = "queued";
    const fingerprint = await digest(`google_sheet:${sourceLeadId}`);
    const { data, error } = await supabase.from("leads").upsert({
      source_system: "google_sheet", source_lead_id: sourceLeadId, ingestion_fingerprint: fingerprint,
      name: text(item.name), phone: text(item.phone), email: text(item.email), city: text(item.city),
      project_id: projectId, source: text(item.source) || "Manual Lead", notes: text(item.notes),
      status: leadStatus, queue_state: runtimeState, assigned_agent_id: runtimeState === "active" ? assignedAgentId : assignedAgentId,
      received_at: text(item.received_at) ? date(item.received_at) : null,
      expires_at: runtimeState === "active" && text(item.expires_at) ? date(item.expires_at) : null,
      queued_at: runtimeState === "queued" ? date(item.queued_at || item.created_at) : null,
      pass_count: Number(item.pass_count) || 0, retry_after_cycle: Number(item.retry_after_cycle) || 0,
      assignment_revision: canonicalAssignmentRevision, status_revision: Number(item.status_revision) || 0,
      status_updated_at: date(item.status_updated_at || item.created_at), created_at: date(item.created_at),
      updated_at: new Date().toISOString(),
    }, { onConflict: "source_system,source_lead_id" }).select("id").single();
    if (error) throw error;
    leadIds.set(sourceLeadId, data.id);

    for (let index = 0; index < history.length; index += 1) {
      const entry = history[index];
      const historyAgent = agentIds.get(text(entry.agentId));
      if (!historyAgent) continue;
      const revision = canonicalAssignmentRevision - history.length + index + 1;
      const outcome = assignmentOutcome(entry.outcome, index === history.length - 1, leadStatus, runtimeState);
      assignmentRows.push({
        lead_id: data.id, agent_id: historyAgent, assignment_revision: revision,
        assigned_at: date(entry.assignedAt || item.received_at || item.created_at),
        expires_at: date(entry.expiresAt || item.expires_at || item.received_at || item.created_at),
        resolved_at: text(entry.resolvedAt) ? date(entry.resolvedAt) : null,
        outcome, retry_cycle: Number(entry.retryCycle) || 0,
      });
    }
  }

  for (let offset = 0; offset < assignmentRows.length; offset += 200) {
    const { error } = await supabase.from("lead_assignments")
      .upsert(assignmentRows.slice(offset, offset + 200), { onConflict: "lead_id,assignment_revision" });
    if (error) throw error;
  }

  for (const item of appointments) {
    const leadId = leadIds.get(text(item.lead_id));
    if (!leadId) continue;
    await supabase.from("appointments").upsert({
      source_appointment_id: text(item.id), lead_id: leadId, type: text(item.type),
      scheduled_at: date(item.scheduled_at), location: text(item.location), notes: text(item.notes),
      status: text(item.status) || "scheduled", assigned_agent_id: agentIds.get(text(item.assigned_agent_id)) || null,
      reminder_state: item.reminder_state && typeof item.reminder_state === "object" ? item.reminder_state : {},
      created_at: date(item.created_at), updated_at: date(item.updated_at),
    }, { onConflict: "source_appointment_id" });
  }

  const reminder = snapshot.follow_up_reminder;
  if (reminder?.id) await supabase.from("reminders").upsert({
    source_reminder_id: text(reminder.id), created_by_id: agentIds.get(text(reminder.created_by_id)) || null,
    target: text(reminder.target), message: text(reminder.message), created_at: date(reminder.created_at),
  }, { onConflict: "source_reminder_id" });

  return Response.json({ ok: true, projects: projects.length, agents: agents.length,
    leads: leads.length, appointments: appointments.length, reminder: Boolean(reminder) });
 } catch (error) {
  const errorMessage = error && typeof error === "object" && "message" in error
    ? String(error.message) : error instanceof Error ? error.message : "Migration failed";
  console.error("Sheet migration failed", errorMessage);
  return Response.json({ ok: false, error: errorMessage }, { status: 409 });
 }
});
