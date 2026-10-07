const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js', 'utf8');
const context = vm.createContext({});
vm.runInContext(app.slice(app.indexOf('function compareLeadLatestActivity('), app.indexOf('\nfunction leadDisplayNotes(')), context);
test('All Leads orders latest activity first regardless of New or closed status', () => {
  const leads = [
    {id:'new',status:'new',createdAt:100},
    {id:'follow-up',status:'contacted',createdAt:10,updatedAt:300},
    {id:'closed',status:'rejected',createdAt:20,updatedAt:400},
    {id:'note',status:'potential',createdAt:30,followUpActivityAt:200},
  ];
  assert.equal(leads.sort(context.compareLeadLatestActivity).map(x=>x.id).join(','),'closed,follow-up,note,new');
});
test('Activity timestamps accept ISO dates and missing legacy fields', () => {
  assert.ok(context.compareLeadLatestActivity({id:'a',updatedAt:'2026-10-08T00:00:00Z'}, {id:'b',receivedAt:100}) < 0);
  assert.equal(context.compareLeadLatestActivity({id:'a',updatedAt:'bad'}, {id:'b'}), -1);
});
test('All filter alone uses latest activity; confirmed Follow Up updates order', () => {
  assert.match(app,/\.sort\(filter === "all" \? compareLeadLatestActivity : compareLeadLogOrder\)/);
  assert.match(app,/updatedAt: row.updated_at \? new Date\(row.updated_at\).getTime\(\) : null/);
  assert.match(app,/lead.updatedAt = Date.now\(\);\s+saveState\(\);\s+renderAll\(\);\s+showToast\("Follow Up direkod"/);
});
