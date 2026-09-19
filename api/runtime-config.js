module.exports = function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  const enabled = process.env.LEADLAJU_BACKEND === "supabase";
  response.status(200).json({
    backend: enabled ? "supabase" : "unconfigured",
    supabaseUrl: enabled ? process.env.SUPABASE_URL || "" : "",
    supabasePublishableKey: enabled ? process.env.SUPABASE_PUBLISHABLE_KEY || "" : "",
  });
};
