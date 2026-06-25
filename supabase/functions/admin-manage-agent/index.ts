import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization") || "";
    const payload = await request.json();

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (payload.action === "signup_request") {
      if (!payload.email || !payload.password || !payload.name) {
        throw new Error("Nama, emel dan kata laluan diperlukan.");
      }

      const email = String(payload.email).trim().toLowerCase();
      const password = String(payload.password);
      const name = String(payload.name).trim();
      const phone = String(payload.phone || "").trim();
      if (password.length < 8) {
        throw new Error("Kata laluan minimum 8 aksara diperlukan.");
      }

      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id, active")
        .eq("email", email)
        .maybeSingle();

      if (existingProfile?.active) {
        throw new Error("Emel ini sudah aktif dalam sistem. Sila log masuk.");
      }

      if (existingProfile?.id) {
        const { error: updateUserError } = await adminClient.auth.admin.updateUserById(existingProfile.id, {
          password,
          email_confirm: true,
          user_metadata: { name, phone, role: "agent" },
        });
        if (updateUserError) throw updateUserError;

        await adminClient.from("profiles").update({
          name,
          phone,
          role: "agent",
          active: false,
        }).eq("id", existingProfile.id);

        return Response.json({ ok: true, pending: true, userId: existingProfile.id }, { headers: corsHeaders });
      }

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone, role: "agent" },
      });
      if (error) throw error;

      await adminClient.from("profiles").upsert({
        id: data.user.id,
        name,
        phone,
        email,
        role: "agent",
        active: false,
      });

      return Response.json({ ok: true, pending: true, userId: data.user.id }, { headers: corsHeaders });
    }

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) throw new Error("Sesi admin tidak sah.");

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .single();
    if (profileError || callerProfile?.role !== "admin" || !callerProfile.active) {
      throw new Error("Hanya admin aktif boleh mengurus akaun ejen.");
    }

    if (payload.action === "create") {
      if (!payload.email || !payload.password || !payload.name) {
        throw new Error("Nama, emel dan kata laluan diperlukan.");
      }
      const shouldActivate =
        payload.active === false || String(payload.active || "").toLowerCase() === "inactive" ? false : true;
      const { data, error } = await adminClient.auth.admin.createUser({
        email: String(payload.email).trim().toLowerCase(),
        password: String(payload.password),
        email_confirm: true,
        user_metadata: {
          name: String(payload.name).trim(),
          phone: String(payload.phone || "").trim(),
          role: "agent",
        },
      });
      if (error) throw error;

      await adminClient.from("profiles").upsert({
        id: data.user.id,
        name: String(payload.name).trim(),
        phone: String(payload.phone || "").trim(),
        email: String(payload.email).trim().toLowerCase(),
        role: "agent",
        active: shouldActivate,
      });
    } else if (payload.action === "approve") {
      if (!payload.userId) {
        throw new Error("User ID diperlukan untuk approve ejen.");
      }
      const { error: updateUserError } = await adminClient.auth.admin.updateUserById(payload.userId, {
        email_confirm: true,
      });
      if (updateUserError) throw updateUserError;

      const { error: profileUpdateError } = await adminClient
        .from("profiles")
        .update({ active: true })
        .eq("id", payload.userId)
        .eq("role", "agent");
      if (profileUpdateError) throw profileUpdateError;
    } else if (payload.action === "update_password") {
      if (!payload.userId || String(payload.password || "").length < 8) {
        throw new Error("User ID dan kata laluan minimum 8 aksara diperlukan.");
      }
      const { error } = await adminClient.auth.admin.updateUserById(payload.userId, {
        password: String(payload.password),
      });
      if (error) throw error;
    } else if (payload.action === "delete") {
      if (!payload.userId || payload.userId === user.id) {
        throw new Error("Akaun ini tidak boleh dibuang.");
      }
      const { data: replacement } = await adminClient
        .from("profiles")
        .select("id")
        .eq("role", "agent")
        .eq("active", true)
        .neq("id", payload.userId)
        .limit(1)
        .maybeSingle();
      const { count: pendingLeadCount } = await adminClient
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("assigned_agent_id", payload.userId)
        .eq("status", "new");
      if (!replacement?.id && pendingLeadCount) {
        throw new Error("Aktifkan ejen pengganti sebelum membuang akaun ini.");
      }
      if (replacement?.id) {
        await adminClient
          .from("leads")
          .update({
            assigned_agent_id: replacement.id,
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          })
          .eq("assigned_agent_id", payload.userId)
          .eq("status", "new");
      }
      const { error } = await adminClient.auth.admin.deleteUser(payload.userId);
      if (error) throw error;
    } else {
      throw new Error("Tindakan tidak dikenali.");
    }

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Ralat tidak diketahui." },
      { status: 400, headers: corsHeaders },
    );
  }
});
