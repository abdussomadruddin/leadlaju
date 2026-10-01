const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('WhatsApp handoff follows durable save without redraw or server wait', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const events = [];
  let reject;
  const context = {
    state: { currentUserId: 'user', leads: [{ id: 'lead', assignmentRevision: 1 }] },
    isTeamSales: () => true, canViewLeadPhone: () => true, guardLifecycleMutation: () => true,
    brandContextVersion: 1, activeBrandId: 'brand', crypto: { randomUUID: () => 'action' }, Date,
    readContactOutbox: async () => [], writeContactOutbox: async () => events.push('saved'),
    salesContactStates: new Map(), renderAll: () => events.push('render'),
    showToast: () => events.push('toast'), loadRemoteState: async () => {},
    window: { location: { assign: () => events.push('whatsapp') } },
    submitContactAction: () => { events.push('server'); return new Promise((resolve, failure) => { reject = failure; }); },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function handleSalesContact('), source.indexOf('function compareLeadLogOrder(')), context);
  const pending = context.handleSalesContact('lead', 'whatsapp', 'https://wa.me/60120000000');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['saved', 'whatsapp', 'server']);
  reject(new Error('network paused'));
  await pending;
  assert.equal(context.salesContactStates.get('lead'), 'pending');
  assert(!events.includes('toast'), 'Retryable failures are not shown as error toasts');
});
