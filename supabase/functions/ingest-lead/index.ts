import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-leadlaju-key",
};
const providers = new Set(["meta_ads", "tiktok_ads"]);

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const apiKey = clean(request.headers.get("X-LeadLaju-Key"));
  if (!apiKey) {
    return Response.json({ ok: false, error: "Missing ingestion API key" }, { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const keyDigest = await sha256(apiKey);
  const { data: keyRecord } = await supabase.from("ingestion_api_keys")
    .select("id,provider").eq("key_digest", keyDigest).eq("active", true).maybeSingle();
  if (!keyRecord) {
    return Response.json({ ok: false, error: "Invalid ingestion key" }, { status: 401, headers: corsHeaders });
  }

  async function markAttempt(result: "inserted" | "duplicate" | "failed", error = "") {
    const completedAt = new Date().toISOString();
    await supabase.from("ingestion_api_keys").update({
      last_used_at: completedAt,
      last_result_at: completedAt,
      last_result: result,
      last_error: error || null,
    }).eq("id", keyRecord.id);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    await markAttempt("failed", "Invalid JSON payload");
    return Response.json({ ok: false, error: "Invalid JSON payload" }, { status: 400, headers: corsHeaders });
  }
  const sourceSystem = clean(body.source_system).toLowerCase();
  const sourceLeadId = clean(body.source_lead_id || body.id);
  if (!providers.has(sourceSystem) || sourceSystem !== keyRecord.provider) {
    await markAttempt("failed", "Source system does not match this API key");
    return Response.json({ ok: false, error: "Source system does not match this API key" }, { status: 403, headers: corsHeaders });
  }
  const canonical = {
    source_system: sourceSystem,
    source_lead_id: sourceLeadId,
    name: clean(body.name || body.nama),
    phone: clean(body.phone || body.phone_number || body["No Phone"]),
    email: clean(body.email || body.emel),
    city: clean(body.city || body.bandar),
    project: clean(body.project || body.projek),
    source: clean(body.source || body.sumber || (sourceSystem === "meta_ads" ? "Meta Ads" : "TikTok Ads")),
    notes: clean(body.notes || body.nota),
    created_at: clean(body.created_at || body["Tarikh & Masa"] || new Date().toISOString()),
  };
  if (!canonical.source_lead_id || !canonical.name || !canonical.phone || !canonical.project) {
    await markAttempt("failed", "source_lead_id, name, phone and project are required");
    return Response.json({
      ok: false,
      error: "source_lead_id, name, phone and project are required",
    }, { status: 400, headers: corsHeaders });
  }
  const createdAt = new Date(canonical.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    await markAttempt("failed", "created_at must be a valid date");
    return Response.json({ ok: false, error: "created_at must be a valid date" }, { status: 400, headers: corsHeaders });
  }
  canonical.created_at = createdAt.toISOString();
  const ingestionKey = `${canonical.source_system}:${canonical.source_lead_id}`;
  const payloadHash = await sha256(JSON.stringify(canonical));
  const { data, error } = await supabase.rpc("ingest_lead", {
    p_ingestion_key: ingestionKey,
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
  if (error) {
    await markAttempt("failed", error.message);
    return Response.json({ ok: false, error: error.message }, { status: 409, headers: corsHeaders });
  }
  await markAttempt(data?.result === "duplicate" ? "duplicate" : "inserted");
  return Response.json(data, { status: 200, headers: corsHeaders });
});
