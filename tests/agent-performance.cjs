const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260928035701_agent_performance_report.sql"), "utf8");
const statusSql = fs.readFileSync(path.join(root, "supabase/migrations/20260928041713_agent_performance_status_counts.sql"), "utf8");

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
  assert.match(app, /if \(viewName === "dashboard" && !isAdmin\(\) && Date\.now\(\) - ownPerformanceLoadedAt > 300000\) loadOwnPerformance\(\)/);
  assert.match(app, /if \(\["agents", "performance",/);
  assert.match(app, /workbook\.addWorksheet\(`Ringkasan \$\{workerLabel\(\)\}`\)/);
  assert.match(app, /workbook\.addWorksheet\("Trend Mingguan"\)/);
});

test("status totals deduplicate leads, use current ownership and preserve report privacy", () => {
  assert.match(statusSql, /count\(distinct lead_id\) filter \(where status = 'contacted'\)/);
  assert.match(statusSql, /status in \('need_follow_up', 'all_offer_presented'\)/);
  assert.match(statusSql, /status in \('cancelled', 'rejected'\)/);
  assert.match(statusSql, /l\.assigned_agent_id = ar\.agent_id/);
  assert.match(statusSql, /from assignment_rows ar/);
  assert.match(statusSql, /and \(p_project_id is null or l\.project_id = p_project_id\)/);
  assert.match(statusSql, /and \(v_admin or id = v_user\)/);
  assert.doesNotMatch(statusSql, /phone|email/);
  for (const field of ["total_contacted", "total_follow_up", "total_potential", "total_cancelled_rejected", "total_client"]) {
    assert.match(statusSql, new RegExp(`'${field}'`));
    assert.match(app, new RegExp(`row\\.${field}`));
  }
  assert.match(html, /Total Cancelled &amp; Rejected/);
  assert.match(app, /trend\.addRow\(\["Minggu bermula"[\s\S]*"Total Client"/);
});

test("performance report uses expandable compact cards on desktop and phone", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(html, /id="performance-cards"/);
  assert.match(app, /<details class="performance-card">/);
  assert.match(app, /performance-week-cards/);
  assert.match(app, /elements\.performanceCards\?\.addEventListener\("click", openPerformanceAgent\)/);
  assert.match(css, /\.performance-cards, \.performance-week-cards \{ display: grid/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /align-items: start/);
  assert.match(app, /class="performance-card-toggle"/);
  assert.match(css, /@keyframes performance-reveal/);
  assert.match(css, /\.performance-card\[open\] \.performance-card-content \{ animation: none; \}/);
  assert.match(html, /class="performance-help"/);
});
