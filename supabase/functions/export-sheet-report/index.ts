import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const workerSecret = Deno.env.get("NOTIFICATION_WORKER_SECRET") || "";
  if (!workerSecret || request.headers.get("X-LeadLaju-Worker") !== workerSecret) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  const body = await request.json().catch(() => ({}));
  const sheetEndpoint = text(body.sheet_endpoint);
  const reportToken = text(body.report_token);
  if (!sheetEndpoint.startsWith("https://script.google.com/macros/s/") || !sheetEndpoint.endsWith("/exec") || !reportToken) {
    return json({ ok: false, error: "Invalid reporting target" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: snapshot, error } = await admin.rpc("get_sheet_reporting_snapshot");
  if (error || !snapshot) return json({ ok: false, error: error?.message || "Report snapshot unavailable" }, 500);

  const response = await fetch(sheetEndpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "replace_reporting_snapshot", reportToken, snapshot }),
  });
  const result = await response.json().catch(() => ({}));
  const rowCounts = Object.fromEntries(
    ["leads", "agents", "projects", "appointments", "reminders"].map((key) => [key, Array.isArray(snapshot[key]) ? snapshot[key].length : 0]),
  );
  await admin.from("report_export_runs").insert({
    state: response.ok && result?.ok ? "sent" : "failed",
    row_counts: rowCounts,
    error: response.ok && result?.ok ? null : text(result?.error || `Sheet HTTP ${response.status}`).slice(0, 500),
  });
  if (!response.ok || !result?.ok) return json({ ok: false, error: text(result?.error || `Sheet HTTP ${response.status}`) }, 502);
  return json({ ok: true, rowCounts });
});
