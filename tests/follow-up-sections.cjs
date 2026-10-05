const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const helpers = source.slice(source.indexOf('function followUpSectionRows('), source.indexOf('function renderFollowUpDue('));

test('Follow Up sections preserve owner scope and count overlapping due leads only once', () => {
  const context = {
    state: { currentUserId: 'owner', leads: [
      { id: 'new', status: 'new', assignedAgentId: 'owner', createdAt: '2026-10-05' },
      { id: 'contacted', status: 'contacted', assignedAgentId: 'owner', createdAt: '2026-10-04' },
      { id: 'other', status: 'new', assignedAgentId: 'other' },
      { id: 'expired', status: 'new', assignedAgentId: 'owner', expired: true },
      { id: 'rejected', status: 'rejected', assignedAgentId: 'owner' },
    ], followUpDue: [{ id: 'contacted', assignedAgentId: 'owner' }] },
    isAdmin: () => false, isVisuallyExpiredAssignment: lead => !!lead.expired, getAgent: () => ({ name: 'Owner' }),
  };
  vm.createContext(context); vm.runInContext(helpers, context);
  assert.equal(context.followUpSectionRows('new').length, 1);
  assert.equal(context.followUpSectionRows('contacted').length, 1);
  assert.equal(context.followUpNavigationCount(), 2);
  context.isAdmin = () => true;
  assert.equal(context.followUpNavigationCount(), 3);
  context.state.leads = []; context.state.followUpDue = [];
  assert.equal(context.followUpNavigationCount(), 0);
});

test('all three sections are available without a distribution-mode restriction', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  for (const section of ['new', 'contacted', 'due']) assert.match(html, new RegExp(`data-follow-up-section="${section}"`));
  assert.match(source, /navigationCount === 0/);
  assert.match(source, /leadDisplayNotes\(lead\) \|\| "Belum ada remark"/);
});
