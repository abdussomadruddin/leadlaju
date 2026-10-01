const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('simultaneous sales pushes group without duplicates or cross-brand mixing', async () => {
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
  assert.equal(notifications.size, 1);
  const group = [...notifications.values()][0];
  assert.equal(group.title, '3 lead baharu masuk');
  assert.equal(group.data.leadId, null);
  assert.equal(group.data.url, '/?view=leads&status=new');
  await context.showLeadNotification(payload('four', 'b'));
  assert.equal(notifications.size, 2);
  assert.equal([...notifications.values()][1].data.leadId, 'four');
});
