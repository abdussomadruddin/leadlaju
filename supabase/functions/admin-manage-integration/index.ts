import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const providers = new Set(["meta_ads", "tiktok_ads"]);

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function providerLabel(provider: string): string {
  return provider === "meta_ads" ? "Meta Ads" : "TikTok Ads";
}

function createRawKey(provider: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `ll_${provider === "meta_ads" ? "meta" : "tiktok"}_${token}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return response({ ok: false, error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const token = clean(request.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return response({ ok: false, error: "Authentication required" }, 401);
  const { data: actor } = await admin.from("profiles").select("role,active,approval_status")
    .eq("id", authData.user.id).maybeSingle();
  if (!actor || actor.role !== "admin" || !actor.active || actor.approval_status !== "approved") {
    return response({ ok: false, error: "Admin required" }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action);
  const provider = clean(body.provider).toLowerCase();

  try {
    if (action === "list") {
      const { data: keys, error: keyError } = await admin.from("ingestion_api_keys")
        .select("id,name,provider,active,last_used_at,last_result,last_error,last_result_at,created_at,revoked_at")
        .in("provider", [...providers]).order("created_at", { ascending: false });
      if (keyError) throw keyError;
      const activeKeys = new Map<string, Record<string, unknown>>();
      for (const key of keys || []) {
        if (key.active && !activeKeys.has(key.provider)) activeKeys.set(key.provider, key);
      }
      return response({
        ok: true,
        integrations: [...providers].map((item) => ({
          provider: item,
          label: providerLabel(item),
          key: activeKeys.get(item) || null,
        })),
      });
    }

    if (!providers.has(provider)) return response({ ok: false, error: "Provider tidak sah." }, 400);

    if (action === "rotate") {
      const rawKey = createRawKey(provider);
      const keyDigest = await sha256(rawKey);
      const { data, error } = await admin.rpc("rotate_ingestion_api_key", {
        p_provider: provider,
        p_name: `${providerLabel(provider)} Pabbly`,
        p_key_digest: keyDigest,
        p_actor: authData.user.id,
      });
      if (error) throw error;
      return response({ ok: true, integration: data, apiKey: rawKey });
    }

    if (action === "revoke") {
      const { data, error } = await admin.rpc("revoke_ingestion_api_key", {
        p_provider: provider,
        p_actor: authData.user.id,
      });
      if (error) throw error;
      return response({ ok: true, result: data });
    }

    return response({ ok: false, error: "Invalid action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Integration operation failed";
    console.error("Integration operation failed", message);
    return response({ ok: false, error: message }, 409);
  }
});
