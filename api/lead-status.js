const GOOGLE_SHEET_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbyXEPXT-m6YETnvOZEy0CxF82CMmMGDmgpVmDIv-a7XTEdJp92mYkOQhaBSRTPnNH7K/exec";

function allowCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(request, response) {
  allowCors(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Method not allowed" });

  let payload = request.body || {};
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return response.status(400).json({ ok: false, error: "Invalid request body" });
    }
  }
  const updatingLeadStatus = payload.action === "update_lead_status";
  const updatingAvailability = payload.action === "set_agent_lead_availability";
  const appointmentActions = new Set([
    "create_appointment",
    "update_appointment_status",
    "update_appointment",
    "reschedule_appointment",
    "delete_appointment",
  ]);
  const updatingAppointment = appointmentActions.has(payload.action);
  if (updatingLeadStatus && (!payload.lead?.id || !payload.lead?.status)) {
    return response.status(400).json({ ok: false, error: "Invalid lead status update" });
  }
  if (updatingAvailability && (!payload.agent?.id || typeof payload.agent.ready !== "boolean")) {
    return response.status(400).json({ ok: false, error: "Invalid agent lead availability update" });
  }
  if (updatingAppointment && !payload.appointment?.lead_id && !payload.appointment?.id) {
    return response.status(400).json({ ok: false, error: "Invalid appointment update" });
  }
  if (!updatingLeadStatus && !updatingAvailability && !updatingAppointment) {
    return response.status(400).json({ ok: false, error: "Unsupported update action" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const upstream = await fetch(GOOGLE_SHEET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await upstream.json();
    return response.status(result?.ok ? 200 : 409).json(result);
  } catch (error) {
    console.error("Google Sheet status proxy failed", error);
    const timedOut = error?.name === "AbortError";
    return response.status(502).json({
      ok: false,
      error: timedOut ? "Google Sheet mengambil masa terlalu lama. Cuba semula." : "Google Sheet tidak dapat dihubungi.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
