module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(410).json({ ok: false, error: "Legacy endpoint disabled. Use Supabase." });
};
