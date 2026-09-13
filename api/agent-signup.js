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

  const agent = payload.agent || {};
  const deletingAgent = payload.action === "delete_agent";
  const hasAgentIdentity = Boolean(agent.id || agent.email);
  const hasCompleteAgent =
    agent.id &&
    agent.name &&
    agent.phone &&
    agent.email &&
    agent.password &&
    Array.isArray(agent.eligible_project_ids) &&
    agent.eligible_project_ids.length > 0;
  if (deletingAgent ? !hasAgentIdentity : !["signup_agent", "approve_agent"].includes(payload.action) || !hasCompleteAgent) {
    return response.status(400).json({ ok: false, error: "Invalid agent signup request" });
  }

  const upstreamPayload = deletingAgent
    ? payload
    : {
        ...payload,
        agent: {
          ...agent,
          role: "agent",
          active: payload.action === "approve_agent" ? "active" : "inactive",
          lead_ready: false,
        },
      };

  try {
    const upstream = await fetch(GOOGLE_SHEET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(upstreamPayload),
    });
    const result = await upstream.json();
    return response.status(result?.ok ? 200 : 409).json(result);
  } catch (error) {
    console.error("Google Sheet signup proxy failed", error);
    return response.status(502).json({ ok: false, error: "Google Sheet tidak dapat dihubungi." });
  }
};
