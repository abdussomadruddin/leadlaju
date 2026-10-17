const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261010161039_eligible_fresh_retry_dispatch.sql'), 'utf8');
test('retry guard checks assignable fresh leads without replacing the tenant dispatcher', () => {
  const guard = sql.split('new_guard text := $new$')[1].split('$new$')[0];
  for (const rule of ['p.get_lead_allowed', 'not p.follow_up_due_blocked', "p.approval_status = 'approved'", 'p.brand_id = fresh.brand_id', 'ape.project_id = fresh.project_id', 'av.notification_ready', 'av.presence_lease_until > p_now', 'p.cooldown_until <= p_now', "occupied.queue_state = 'active'"]) assert.ok(guard.includes(rule), rule);
  assert.match(sql, /execute replace\(definition, old_guard, new_guard\)/);
  assert.match(sql, /raise exception 'Unexpected dispatcher/);
  assert.doesNotMatch(sql, /update public.leads|alter function.*owner|grant /i);
});
