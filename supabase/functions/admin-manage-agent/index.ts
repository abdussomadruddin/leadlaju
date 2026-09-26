import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return response({ ok: false, error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const body = await request.json().catch(() => ({}));
  const action = text(body.action);

  try {
    if (action === "list_projects") {
      const { data, error } = await admin.from("projects").select("id,name,active,created_at")
        .eq("active", true).order("created_at");
      if (error) throw error;
      return response({ ok: true, projects: data || [] });
    }

    if (action === "signup_request") {
      const name = text(body.name);
      const phone = text(body.phone);
      const email = text(body.email).toLowerCase();
      const password = text(body.password);
      const projectIds = Array.isArray(body.eligible_project_ids)
        ? [...new Set(body.eligible_project_ids.map(text).filter(Boolean))]
        : [];
      if (!name || !phone || !email || password.length < 8 || !projectIds.length) {
        return response({ ok: false, error: "Maklumat pendaftaran tidak lengkap." }, 400);
      }

      const { data: projects, error: projectError } = await admin.from("projects")
        .select("id").in("id", projectIds).eq("active", true);
      if (projectError) throw projectError;
      if ((projects || []).length !== projectIds.length) {
        return response({ ok: false, error: "Pilihan projek tidak sah." }, 400);
      }

      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: "agent", approval_status: "pending" },
      });
      if (created.error || !created.data.user) {
        const duplicate = /already|registered|exists/i.test(created.error?.message || "");
        return response({ ok: false, error: duplicate ? "Emel ini sudah didaftarkan." : "Akaun tidak dapat dicipta." }, duplicate ? 409 : 400);
      }

      const userId = created.data.user.id;
      const { error: profileError } = await admin.from("profiles").insert({
        id: userId,
        name,
        phone,
        email,
        role: "agent",
        approval_status: "pending",
        active: false,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(userId);
        throw profileError;
      }
      const eligibility = projectIds.map((projectId) => ({ agent_id: userId, project_id: projectId }));
      const { error: eligibilityError } = await admin.from("agent_project_eligibility").insert(eligibility);
      if (eligibilityError) {
        await admin.auth.admin.deleteUser(userId);
        throw eligibilityError;
      }
      await admin.from("agent_availability").insert({ agent_id: userId, lead_ready: false, notification_ready: false });
      const { data: admins } = await admin.from("profiles").select("id")
        .eq("role", "admin").eq("active", true).eq("approval_status", "approved");
      if (admins?.length) {
        await admin.from("notification_outbox").insert(admins.map((item) => ({
          user_id: item.id,
          notification_type: "agent_signup",
          dedupe_key: `agent_signup:${userId}:${item.id}`,
          payload: {
            title: "Permohonan ejen baharu",
            body: `${name} menunggu approval.`,
            tag: `leadlaju-agent-signup-${userId}`,
            view: "agents",
            url: "/?view=agents",
            requireInteraction: true,
          },
        })));
      }
      return response({ ok: true, userId, approval_status: "pending", active: false });
    }

    const token = text(request.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return response({ ok: false, error: "Authentication required" }, 401);
    const { data: actor } = await admin.from("profiles").select("role,active,approval_status")
      .eq("id", authData.user.id).maybeSingle();
    if (action === "update_self_name") {
      const name = text(body.name);
      if (!actor || !actor.active || actor.approval_status !== "approved") {
        return response({ ok: false, error: "Akaun tidak aktif." }, 403);
      }
      if (!name || name.length > 120) return response({ ok: false, error: "Nama tidak sah." }, 400);
      const { data: profile, error } = await admin.from("profiles")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", authData.user.id).select("id,name").single();
      if (error) throw error;
      return response({ ok: true, profile });
    }
    if (!actor || actor.role !== "admin" || !actor.active || actor.approval_status !== "approved") {
      return response({ ok: false, error: "Admin required" }, 403);
    }

    const userId = text(body.userId);
    if (!userId || userId === authData.user.id) return response({ ok: false, error: "Invalid agent" }, 400);
    const { data: target } = await admin.from("profiles").select("id,email,role,approval_status")
      .eq("id", userId).maybeSingle();
    if (!target || target.role !== "agent") return response({ ok: false, error: "Agent not found" }, 404);

    const actorClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    if (action === "approve") {
      const { count } = await admin.from("agent_project_eligibility")
        .select("agent_id", { count: "exact", head: true }).eq("agent_id", userId);
      if (!count) return response({ ok: false, error: "Pilih sekurang-kurangnya satu projek." });
      const { data: approvedProfile, error } = await admin.from("profiles").update({
        approval_status: "approved",
        active: true,
        updated_at: new Date().toISOString(),
      }).eq("id", userId).eq("approval_status", "pending").select("id").maybeSingle();
      if (error) throw error;
      if (!approvedProfile) return response({ ok: false, error: "Status ejen sudah berubah. Sila sync semula." });
      const updated = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { role: "agent", approval_status: "approved" },
      });
      if (updated.error) throw updated.error;
      return response({ ok: true, userId, approval_status: "approved", active: true });
    }

    if (action === "update_password") {
      const password = text(body.password);
      if (password.length < 8) return response({ ok: false, error: "Kata laluan mesti sekurang-kurangnya 8 aksara." }, 400);
      const updated = await admin.auth.admin.updateUserById(userId, { password });
      if (updated.error) throw updated.error;
      return response({ ok: true, userId, password_updated: true });
    }

    if (action === "update_details") {
      const name = text(body.name);
      const phone = text(body.phone);
      const email = text(body.email).toLowerCase();
      const active = body.active !== false;
      const projectIds = Array.isArray(body.eligible_project_ids)
        ? [...new Set(body.eligible_project_ids.map(text).filter(Boolean))]
        : [];
      if (!name || !phone || !email || !projectIds.length) {
        return response({ ok: false, error: "Maklumat ejen tidak lengkap." }, 400);
      }

      const authPatch = email === target.email ? null : await admin.auth.admin.updateUserById(userId, { email });
      if (authPatch?.error) throw authPatch.error;
      const updated = await actorClient.rpc("admin_update_agent", {
        p_agent_id: userId,
        p_name: name,
        p_phone: phone,
        p_email: email,
        p_active: active,
        p_project_ids: projectIds,
      });
      if (updated.error || !updated.data?.ok) {
        if (authPatch) await admin.auth.admin.updateUserById(userId, { email: target.email });
        throw updated.error || new Error("Agent details could not be updated");
      }
      return response({ ok: true, userId, profile: updated.data.profile });
    }

    if (action === "delete") {
      const { count: assignmentCount, error: assignmentError } = await admin.from("lead_assignments")
        .select("id", { count: "exact", head: true }).eq("agent_id", userId);
      if (assignmentError) throw assignmentError;

      if (!assignmentCount) {
        const deletion = await admin.auth.admin.deleteUser(userId);
        if (deletion.error) throw deletion.error;
        return response({ ok: true, userId, deleted: true });
      }

      const retired = await actorClient.rpc("admin_retire_agent", { p_agent_id: userId });
      if (retired.error || !retired.data?.ok) throw retired.error || new Error("Agent could not be retired");
      const updated = await admin.auth.admin.updateUserById(userId, {
        email: retired.data.tombstone_email,
        app_metadata: { role: "agent", approval_status: "rejected" },
        ban_duration: "876000h",
      });
      if (updated.error) throw updated.error;
      return response({ ok: true, userId, deleted: true, history_preserved: true });
    }

    return response({ ok: false, error: "Invalid action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent operation failed";
    console.error("Agent operation failed", message);
    return response({ ok: false, error: message }, 409);
  }
});
