import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function malaysiaTimestamp(value: unknown): string {
  const raw = text(value);
  const local = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw);
  const parsed = new Date(local ? `${raw.replace(" ", "T")}+08:00` : raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  const secret = Deno.env.get("NOTIFICATION_WORKER_SECRET") || "";
  if (!secret || request.headers.get("X-LeadLaju-Worker") !== secret) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const sheetEndpoint = text(body.sheet_endpoint);
  if (!sheetEndpoint.startsWith("https://script.google.com/macros/s/") || !sheetEndpoint.endsWith("/exec")) {
    return Response.json({ ok: false, error: "Invalid Sheet endpoint" }, { status: 400 });
  }

  const response = await fetch(sheetEndpoint, { redirect: "follow" });
  if (!response.ok) return Response.json({ ok: false, error: `Sheet HTTP ${response.status}` }, { status: 502 });
  const snapshot = await response.json();
  const rows = Array.isArray(snapshot) ? snapshot : Array.isArray(snapshot.leads) ? snapshot.leads : [];
  const sourceIds = [...new Set(rows.map((row: Record<string, unknown>) => text(row.id)).filter(Boolean))];
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const existing = new Set<string>();
  for (let offset = 0; offset < sourceIds.length; offset += 200) {
    const { data, error } = await admin.from("leads").select("source_lead_id")
      .eq("source_system", "google_sheet").in("source_lead_id", sourceIds.slice(offset, offset + 200));
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    for (const row of data || []) existing.add(text(row.source_lead_id));
  }

  let inserted = 0;
  let failed = 0;
  for (const row of rows as Record<string, unknown>[]) {
    const sourceId = text(row.id);
    if (!sourceId || existing.has(sourceId)) continue;
    const canonical = {
      source_system: "google_sheet",
      source_lead_id: sourceId,
      name: text(row.name || row.nama),
      phone: text(row.phone || row.phone_number || row["No Phone"]),
      email: text(row.email || row.emel),
      city: text(row.city || row.bandar),
      project: text(row.project || row.projek),
      source: text(row.source || row.sumber || "Manual Lead"),
      notes: text(row.notes || row.nota),
      created_at: malaysiaTimestamp(row.created_at || row["Tarikh & Masa"]),
    };
    const payloadHash = await sha256(JSON.stringify(canonical));
    const { data, error } = await admin.rpc("ingest_lead", {
      p_ingestion_key: `sheet-sweep:${sourceId}`,
      p_source_system: canonical.source_system,
      p_source_lead_id: canonical.source_lead_id,
      p_name: canonical.name,
      p_phone: canonical.phone,
      p_email: canonical.email,
      p_city: canonical.city,
      p_project_name: canonical.project,
      p_source: canonical.source,
      p_notes: canonical.notes,
      p_created_at: canonical.created_at,
      p_payload_hash: payloadHash,
    });
    if (error || !data?.ok) failed += 1;
    else if (data.result === "inserted") inserted += 1;
  }
  return Response.json({ ok: failed === 0, scanned: rows.length, missing: sourceIds.length - existing.size, inserted, failed });
});
