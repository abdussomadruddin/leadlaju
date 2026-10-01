const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const start = source.indexOf('async function addManualLead(');
const validation = source.slice(start, source.indexOf('  const createdAt =', start)) + 'return project; }';

test('manual lead requires a selected active project ID, then submits its canonical name', async () => {
  const context = vm.createContext({
    guardLifecycleMutation: () => true, isAdmin: () => true, systemWorkerText: text => text,
    state: { projects: [{ id: 'active', name: 'Canonical Product', active: true }, { id: 'inactive', name: 'Old Product', active: false }] },
    elements: { manualLeadName: { value: 'Fixture' }, manualLeadPhone: { value: '60123456789' }, manualLeadEmail: { value: '' }, manualLeadProject: { value: 'active' }, manualLeadSource: { value: 'Manual Lead' }, manualLeadError: { textContent: '' } },
  });
  vm.runInContext(validation, context);
  assert.equal(await context.addManualLead({ preventDefault() {} }), 'Canonical Product');
  for (const value of ['', 'inactive', 'other-brand-id', 'Canonical Product']) {
    context.elements.manualLeadProject.value = value;
    assert.equal(await context.addManualLead({ preventDefault() {} }), undefined);
    assert.match(context.elements.manualLeadError.textContent, /Masukkan/);
  }
});

test('manual lead project is a required selector, never a free-text input', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /<select id="manual-lead-project" required>/);
  assert.doesNotMatch(html, /<input id="manual-lead-project"/);
});
