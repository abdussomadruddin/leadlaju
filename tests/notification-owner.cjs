const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('lead notifications are restricted to the assigned account', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('function shouldNotifyForLead(');
  const context = vm.createContext({ state: { currentUserId: 'a' }, isAdmin: () => true });
  vm.runInContext(source.slice(start, source.indexOf('\nfunction ', start + 1)), context);
  assert.equal(context.shouldNotifyForLead({ status: 'new', assignedAgentId: 'a' }), true);
  assert.equal(context.shouldNotifyForLead({ status: 'new', assignedAgentId: 'b' }), false);
  assert.equal(context.shouldNotifyForLead({ status: 'queued', assignedAgentId: 'a' }), false);
});

test('conflicting subscription ID cannot match through email fallback', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync('google-apps-script/Code.gs', 'utf8'), context);
  const subscriptions = [
    { agentId: 'a', agentEmail: 'a@example.com' },
    { agentId: 'b', agentEmail: 'a@example.com' },
  ];
  const result = context.filterSubscriptionsForAgent_(subscriptions, { id: 'a', email: 'a@example.com' });
  assert.equal(result.length, 1);
  assert.equal(result[0].agentId, 'a');
});
