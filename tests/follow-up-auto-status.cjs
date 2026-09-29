const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20260929201246_auto_need_follow_up_after_15_days_due.sql', 'utf8');

test('only Contacted leads assigned for more than 15 days in Follow Up Due auto-transition', () => {
  assert.match(migration, /where l\.status = 'contacted'/);
  assert.match(migration, /l\.assigned_agent_id is not null/);
  // Follow Up Due starts after one day; fifteen more days makes sixteen days from activity.
  assert.match(migration, /l\.follow_up_activity_at < p_now - interval '16 days'/);
  assert.match(migration, /status = 'need_follow_up'::public\.leadlaju_lead_status/);
  assert.match(migration, /queue_state = 'need_follow_up'::public\.leadlaju_queue_state/);
  assert.match(migration, /status_revision = l\.status_revision \+ 1/);
});

test('automatic transition is private, audited, and scheduled hourly', () => {
  assert.match(migration, /insert into public\.lead_events/);
  assert.match(migration, /'status_changed:need_follow_up'/);
  assert.match(migration, /'follow_up_due_over_15_days'/);
  assert.match(migration, /revoke all on function leadlaju_private\.promote_stale_follow_up_due\(timestamptz\)/);
  assert.match(migration, /'leadlaju-follow-up-auto-status',\s*'5 \* \* \* \*'/);
});
