const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20260923040344_follow_up_due.sql', 'utf8');
const worker = fs.readFileSync('supabase/functions/process-notification-outbox/index.ts', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

test('follow-up activity starts on Contacted and only changed notes reset it', () => {
  assert.match(migration, /new\.status = 'contacted' and old\.status is distinct from new\.status/);
  assert.match(migration, /new\.status = 'contacted' and old\.notes is distinct from new\.notes/);
  assert.match(migration, /old\.status = 'contacted' and new\.status <> 'contacted'/);
  assert.match(migration, /before update of status, notes on public\.leads/);
});

test('canonical feed is scoped and uses the exact 48-hour threshold', () => {
  assert.match(migration, /function public\.get_follow_up_due\(\)/);
  assert.match(migration, /l\.follow_up_activity_at <= now\(\) - interval '2 days'/);
  assert.match(migration, /v_is_admin or l\.assigned_agent_id = v_user/);
  assert.match(migration, /'server_now', now\(\)/);
  assert.match(migration, /grant execute on function public\.get_follow_up_due\(\) to authenticated/);
});

test('grouped reminders use Kuala Lumpur 8 AM and 4 PM slots after 72 hours', () => {
  assert.match(migration, /p_now at time zone 'Asia\/Kuala_Lumpur'/);
  assert.match(migration, /extract\(hour from v_local\) not in \(8, 16\)/);
  assert.match(migration, /l\.follow_up_activity_at <= p_now - interval '3 days'/);
  assert.match(migration, /group by l\.assigned_agent_id/);
  assert.match(migration, /'follow_up_due:' \|\| v_date_key \|\| ':' \|\| v_slot/);
  assert.match(migration, /'leadlaju-follow-up-due-reminders'/);
});

test('worker suppresses stale grouped alerts and refreshes the canonical count', () => {
  assert.match(worker, /first\.notification_type === "follow_up_due"/);
  assert.match(worker, /rpc\("get_follow_up_notification_count"/);
  assert.match(migration, /follow_up_activity_at <= now\(\) - interval '3 days'/);
  assert.match(worker, /if \(followUpError \|\| !count\)/);
  assert.match(worker, /followUpDueCount: count/);
});

test('Follow Up Due navigation, filters and lead handoff are wired for desktop and phone', () => {
  assert.match(html, /data-view="follow-up-due"/);
  assert.match(html, /id="nav-follow-up-count"/);
  assert.match(html, /id="follow-up-agent-filter"/);
  assert.match(html, /id="follow-up-project-filter"/);
  assert.match(html, /id="follow-up-month-filter"/);
  assert.match(html, /id="follow-up-year-filter"/);
  assert.match(app, /rpc\("get_follow_up_due"\)/);
  assert.match(app, /data-follow-up-open/);
  assert.match(app, /"follow-up-due": "Follow Up Due"/);
  assert.match(css, /@media \(max-width: 650px\)[\s\S]*\.follow-up-due-item/);
  assert.match(sw, /notificationData\.leadId \? "OPEN_DASHBOARD" : view \? "OPEN_VIEW" : "OPEN_DASHBOARD"/);
});
