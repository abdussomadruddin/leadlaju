import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

export function serviceClient(brandId = "") {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: brandId ? { "x-leadlaju-brand": brandId } : {} },
  });
}

export async function requestActor(request: Request) {
  const db = serviceClient();
  const token = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Authentication required");
  const profile = await db.from("profiles").select("id,role,brand_id,active,approval_status,email,name").eq("id", data.user.id).maybeSingle();
  if (profile.error || !profile.data?.active || profile.data.approval_status !== "approved") throw new Error("Akaun tidak aktif.");
  return profile.data;
}

export async function actorBrand(request: Request, actor: { role: string; brand_id: string | null }, requested = "") {
  const selected = requested || request.headers.get("x-leadlaju-brand") || "";
  const brandId = actor.role === "master" ? selected : actor.brand_id;
  if (!brandId || (actor.role !== "master" && selected && selected !== brandId)) throw new Error("Brand access denied");
  const { data, error } = await serviceClient().from("brands").select("id,name,slug,active,distribution_mode").eq("id", brandId).maybeSingle();
  if (error || !data?.active) throw new Error("Brand tidak aktif.");
  return data;
}

export async function signupBrand(slug: unknown) {
  const name = String(slug || "safrich").trim().toLowerCase();
  const { data, error } = await serviceClient().from("brands").select("id,name,slug,active,distribution_mode").eq("slug", name).eq("active", true).maybeSingle();
  if (error || !data) throw new Error("Link pendaftaran brand tidak sah atau brand tidak aktif.");
  return data;
}
