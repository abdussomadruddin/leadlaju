const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync('supabase/migrations/20261008120143_agent_follow_up_due_limit.sql', 'utf8');
const source = fs.readFileSync('app.js', 'utf8');
test('due gate is Agent-only, exceeds threshold and stays latched until empty', () => {
  assert.match(sql, /active and distribution_mode='agent'/);
  assert.match(sql, /when due_count=0 then false when due_count>follow_up_due_limit then true else follow_up_due_blocked/);
  assert.match(sql, /default 50/);
  assert.match(sql, /and not p.follow_up_due_blocked/);
  assert.match(sql, /Trusted scheduler required/);
});
test('popup gate precedes device checks and settings exclude Team Sales', () => {
  const start = source.indexOf('async function setAgentLeadAvailability(');
  const body = source.slice(start, source.indexOf('function enforceAgentNotificationAccess', start));
  assert.ok(body.indexOf('user.followUpDueBlocked') < body.indexOf('!isPhonePushDevice()'));
  assert.match(body, /ready && !isTeamSales\(\) && user.followUpDueBlocked/);
  assert.match(source, /form.hidden = !isAdmin\(\) \|\| isTeamSales\(\)/);
  assert.match(source, /rpc\("admin_set_follow_up_due_limit"/);
});
