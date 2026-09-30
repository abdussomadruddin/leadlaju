import { actorBrand, requestActor, serviceClient } from "../_shared/brand-access.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-leadlaju-brand" };
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: cors });
const clean = (x: unknown) => String(x ?? "").trim();
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ ok: false, error: "Method not allowed" }, 405);
  try {
    const actor = await requestActor(request);
    if (actor.role !== "master") return reply({ ok: false, error: "Master required" }, 403);
    const body = await request.json();
    const db = serviceClient();
    const action = clean(body.action);
    if (action === "list_admins") {
      const { data, error } = await db.from("profiles").select("id,name,email,phone,brand_id,active,approval_status,created_at").eq("role", "admin").order("created_at");
      if (error) throw error;
      return reply({ ok: true, admins: data || [] });
    }
    if (action === "create_admin") {
      const brand = await actorBrand(request, actor, clean(body.brand_id));
      const name = clean(body.name), email = clean(body.email).toLowerCase();
      if (!name || name.length > 120 || !email.includes("@")) throw new Error("Maklumat Admin tidak lengkap.");
      const invited = await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${Deno.env.get("LEADLAJU_APP_URL") || "https://leadlaju.vercel.app"}/?setup=1` });
      if (invited.error || !invited.data.user) throw invited.error || new Error("Jemputan tidak berjaya.");
      const id = invited.data.user.id;
      const profile = await db.from("profiles").insert({ id, name, email, phone: clean(body.phone), role: "admin", brand_id: brand.id, active: true, approval_status: "approved" });
      if (profile.error) { await db.auth.admin.deleteUser(id); throw profile.error; }
      const audited = await db.from("master_audit_log").insert({ actor_id: actor.id, brand_id: brand.id, action, target_id: id });
      if (audited.error) throw audited.error;
      return reply({ ok: true, userId: id, invited: true });
    }
    const id = clean(body.userId);
    const { data: target, error } = await db.from("profiles").select("id,email,role,brand_id").eq("id", id).eq("role", "admin").maybeSingle();
    if (error || !target) throw new Error("Admin tidak ditemui.");
    if (action === "update_admin") {
      const name = clean(body.name);
      if (!name || name.length > 120) throw new Error("Nama tidak sah.");
      const updated = await db.from("profiles").update({ name, phone: clean(body.phone), active: body.active !== false, updated_at: new Date().toISOString() }).eq("id", id).eq("role", "admin").eq("brand_id", target.brand_id);
      if (updated.error) throw updated.error;
    } else if (action === "reset_admin_password") {
      const sent = await db.auth.resetPasswordForEmail(target.email, { redirectTo: `${Deno.env.get("LEADLAJU_APP_URL") || "https://leadlaju.vercel.app"}/?setup=1` });
      if (sent.error) throw sent.error;
    } else throw new Error("Invalid action");
    const audited = await db.from("master_audit_log").insert({ actor_id: actor.id, brand_id: target.brand_id, action, target_id: id });
    if (audited.error) throw audited.error;
    return reply({ ok: true });
  } catch (e) { return reply({ ok: false, error: e instanceof Error ? e.message : "Account operation failed" }, 403); }
});
