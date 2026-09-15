import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-leadlaju-key,x-ingestion-key",
};

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
  const ingestionKey = clean(request.headers.get("X-Ingestion-Key"));
  if (!apiKey || !ingestionKey) {
    return Response.json({ ok: false, error: "Missing ingestion credentials" }, { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const keyDigest = await sha256(apiKey);
  const { data: keyRecord } = await supabase.from("ingestion_api_keys")
    .select("id").eq("key_digest", keyDigest).eq("active", true).maybeSingle();
  if (!keyRecord) {
    return Response.json({ ok: false, error: "Invalid ingestion key" }, { status: 401, headers: corsHeaders });
  }

  const body = await request.json().catch(() => ({}));
  const canonical = {
    source_system: clean(body.source_system || "google_sheet"),
    source_lead_id: clean(body.source_lead_id || body.id),
    name: clean(body.name || body.nama),
    phone: clean(body.phone || body.phone_number || body["No Phone"]),
    email: clean(body.email || body.emel),
    city: clean(body.city || body.bandar),
    project: clean(body.project || body.projek),
    source: clean(body.source || body.sumber || "Manual Lead"),
    notes: clean(body.notes || body.nota),
    created_at: clean(body.created_at || body["Tarikh & Masa"] || new Date().toISOString()),
  };
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
  if (error) return Response.json({ ok: false, error: error.message }, { status: 409, headers: corsHeaders });
  await supabase.from("ingestion_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRecord.id);
  return Response.json(data, { status: 200, headers: corsHeaders });
});
