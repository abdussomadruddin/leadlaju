const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260928035701_agent_performance_report.sql"), "utf8");

test("performance report is server-owned and rejects cross-agent requests", () => {
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /not v_admin and p_agent_id is not null and p_agent_id <> v_user/);
  assert.match(sql, /and \(v_admin or id = v_user\)/);
  assert.match(sql, /revoke all on function public\.get_agent_performance_report[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.get_agent_performance_report[\s\S]+to authenticated/);
  assert.doesNotMatch(sql, /phone|email/);
});

test("response SLA uses assignment timing and expired attempts remain in denominator", () => {
  assert.match(sql, /la\.resolved_at <= la\.assigned_at \+ interval '5 minutes'/);
  assert.match(sql, /count\(\*\)::integer as assignments/);
  assert.match(sql, /count\(\*\) filter \(where within_five\)/);
  assert.match(sql, /la\.assigned_at >= v_start and la\.assigned_at < v_end/);
});

test("appointment reschedules resolve to one latest chain record", () => {
  assert.match(sql, /with recursive/);
  assert.match(sql, /child\.parent_appointment_id = chain\.id/);
  assert.match(sql, /select distinct on \(root_id\)/);
  assert.match(sql, /order by root_id, depth desc, created_at desc/);
});

test("admin report and private agent summary are separate surfaces", () => {
  assert.match(html, /data-view="performance"/);
  assert.match(html, /id="own-performance"/);
  assert.match(html, /id="performance-download"/);
  assert.match(app, /if \(viewName === "dashboard" && !isAdmin\(\)\) loadOwnPerformance\(\)/);
  assert.match(app, /if \(\["agents", "performance",/);
  assert.match(app, /workbook\.addWorksheet\("Ringkasan Ejen"\)/);
  assert.match(app, /workbook\.addWorksheet\("Trend Mingguan"\)/);
});
