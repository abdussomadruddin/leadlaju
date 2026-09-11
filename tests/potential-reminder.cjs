const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('potential reminders count only assigned Potential leads', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync('google-apps-script/Code.gs', 'utf8'), context);
  const counts = context.potentialLeadCountsByAgent_([
    { assigned_agent_id: 'agent-a', status: 'Potential' },
    { assigned_agent_id: 'agent-a', status: 'Contacted' },
    { assigned_agent_id: 'agent-b', status: 'potential' },
    { assigned_agent_id: '', status: 'Potential' },
  ]);
  assert.equal(counts.get('agent-a'), 1);
  assert.equal(counts.get('agent-b'), 1);
  assert.equal(counts.has(''), false);
});

test('potential reminders exclude logged-out or inactive agents', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync('google-apps-script/Code.gs', 'utf8'), context);
  assert.equal(context.isPotentialReminderAgent_({
    role: 'agent', active: 'active', notification_enabled: true, last_seen_at: '2026-09-11 08:00:00',
  }), true);
  assert.equal(context.isPotentialReminderAgent_({
    role: 'agent', active: 'active', notification_enabled: false, last_seen_at: '',
  }), false);
});

test('potential push and popup use the dedicated reminder route', () => {
  const server = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const app = fs.readFileSync('app.js', 'utf8');
  const worker = fs.readFileSync('sw.js', 'utf8');
  assert.match(server, /function processPotentialLeadReminders_\(spreadsheet, leads, agents\)/);
  assert.match(server, /title: "Prospek panas menunggu"/);
  assert.match(server, /url: "\/\?view=leads&reminder=potential"/);
  assert.match(app, /function openPotentialReminderModal\(\)/);
  assert.match(app, /OPEN_POTENTIAL_REMINDER/);
  assert.match(worker, /reminderType === "potential"/);
});
