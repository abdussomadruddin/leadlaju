const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('simultaneous sales pushes remain individual without duplicates or cross-brand mixing', async () => {
  const source = fs.readFileSync('sw.js', 'utf8');
  const notifications = new Map();
  const context = { Date, Promise, Set, String, Number,
    createLeadTiming: () => ({}), logLeadTiming: () => {}, cacheLeadSnapshot: async () => {},
    self: { registration: {
      getNotifications: async () => [...notifications.values()],
      showNotification: async (title, options) => notifications.set(options.tag, { title, ...options }),
    } },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('let leadNotificationChain'), source.indexOf('function deliverLeadSnapshotToClient')), context);
  const payload = (id, brand = 'a') => ({ leadId: id, tag: `leadlaju-sales-${id}`, leadSnapshot: { brand_id: brand, assigned_agent_id: 'user' } });
  await Promise.all(['one', 'two', 'two', 'three'].map(id => context.showLeadNotification(payload(id))));
  assert.equal(notifications.size, 3);
  const group = [...notifications.values()][0];
  assert.equal(group.data.leadId, 'one');
  assert.equal(group.data.url, '/?view=follow-up-due&section=new');
  assert.equal(group.data.reminderType, 'new-lead');
  await context.showLeadNotification(payload('four', 'b'));
  assert.equal(notifications.size, 4);
  assert.equal([...notifications.values()][3].data.leadId, 'four');
});
