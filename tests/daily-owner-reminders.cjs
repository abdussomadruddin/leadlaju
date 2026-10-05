const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const file = fs.readdirSync('supabase/migrations').find(name => name.endsWith('_team_sales_daily_follow_up_rules.sql'));
const sql = fs.readFileSync(`supabase/migrations/${file}`, 'utf8');

test('daily slots include 13:00 and the shared due schedule uses Kuala Lumpur', () => {
  assert.match(sql, /Asia\/Kuala_Lumpur/);
  assert.match(sql, /not in \(10,11,12,13,14,15,16\)/);
  assert.match(sql, /not in \(9,15,21\)/);
  assert.match(sql, /kind='sales_due_daily' or b\.distribution_mode='team_sales'/);
  assert.match(sql, /p\.role='agent' and p\.active/);
});

test('age promotion preserves events and resolves pending assignments without claiming contact', () => {
  assert.match(sql, /l\.created_at<p_now-interval '15 days'/);
  assert.match(sql, /l\.status in \('new','contacted'\)/);
  assert.match(sql, /outcome='need_follow_up',resolved_at=p_now/);
  assert.match(sql, /lead_age_over_15_days/);
  assert.match(sql, /grant execute on function public\.validate_sales_contact_reminder.*to service_role/);
});

test('daily retries revalidate owner revision, changed notes, status and slot expiry', () => {
  assert.match(sql, /l\.assigned_agent_id=p_user_id/);
  assert.match(sql, /l\.assignment_revision=\(x\.value->>'revision'\)::bigint/);
  assert.match(sql, /l\.follow_up_activity_at=\(x\.value->>'activityAt'\)::timestamptz/);
  assert.match(sql, /now\(\)>=slot_at\+interval '15 minutes'/);
  const worker = fs.readFileSync('supabase/functions/process-notification-outbox/index.ts', 'utf8');
  assert.match(worker, /"sales_new_daily", "sales_due_daily"/);
});
