const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js', 'utf8');
function fixture() {
  const context = vm.createContext({isTeamSales:()=>true,getLeadVisualStatus:lead=>lead.status,activeBrandId:'brand-a',
    salesLeadDrilldown:{brandId:'brand-a',from:'2026-10-01',to:'2026-10-04',agentIds:['owner']},
    todayKey:ms=>new Date(ms+8*3600000).toISOString().slice(0,10),Date,escapeHtml:String});
  for (const [start,end] of [['function compareLeadLogOrder(', '\nfunction leadDisplayNotes('],
    ['function matchesSalesDrilldown(', '\nfunction openSalesPerformance('],
    ['function performanceMetric(', '\nfunction renderOwnPerformance('],
    ['function salesNewLeadCount(', '\nfunction renderTeamPerformance(']]) {
    vm.runInContext(app.slice(app.indexOf(start),app.indexOf(end)),context);
  }
  return context;
}
test('Team Sales prioritizes oldest New; Agent ordering is unchanged',()=>{
  const c=fixture();
  const rows=[{id:'contacted',status:'contacted',receivedAt:100},{id:'newer',status:'new',createdAt:30,receivedAt:30},
    {id:'rejected',status:'rejected',receivedAt:200},{id:'oldest',status:'new',createdAt:10,receivedAt:10}];
  assert.equal(rows.sort(c.compareLeadLogOrder).map(x=>x.id).join(','),'oldest,newer,contacted,rejected');
  c.isTeamSales=()=>false;
  assert.equal(rows.sort(c.compareLeadLogOrder).map(x=>x.id).join(','),'contacted,newer,oldest,rejected');
});
test('Card range follows assignment ownership and Kuala Lumpur date boundaries',()=>{
  const c=fixture();const lead=(owner,date,historyOwner=owner)=>({assignedAgentId:owner,assignmentHistory:[{agentId:historyOwner,assignedAt:date}]});
  assert.equal(c.matchesSalesDrilldown(lead('owner','2026-09-30T16:00:00Z')),true);
  assert.equal(c.matchesSalesDrilldown(lead('owner','2026-10-04T16:00:00Z')),false);
  assert.equal(c.matchesSalesDrilldown(lead('owner','2026-10-01T01:00:00Z','former-owner')),false);
  assert.equal(c.matchesSalesDrilldown(lead('not-in-report','2026-10-01T01:00:00Z')),false);
});
test('Due drilldown uses current age, not assignment report dates',()=>{
  const c=fixture();c.salesLeadDrilldown={brandId:'brand-a',overdue:true};
  assert.equal(Boolean(c.matchesSalesDrilldown({status:'new',assignedAgentId:'owner',createdAt:Date.now()-3601000})),true);
  assert.equal(Boolean(c.matchesSalesDrilldown({status:'contacted',assignedAgentId:'owner',createdAt:Date.now()-7200000})),false);
  assert.equal(Boolean(c.matchesSalesDrilldown({status:'new',assignedAgentId:'owner',createdAt:Date.now()-600000})),false);
});
test('Only Team Sales status metrics are keyboard-accessible filter buttons',()=>{
  const c=fixture();assert.match(c.performanceMetric('Follow Up',2),/^<button type="button" data-sales-performance="group_follow_up"/);
  assert.match(c.performanceMetric('New',2),/data-sales-performance="new"/);
  assert.match(c.performanceMetric('Cancelled / Rejected',2),/data-sales-performance="group_cancelled_rejected"/);
  assert.match(c.performanceMetric('Follow Up Due',2),/data-sales-performance="due"/);
  c.isTeamSales=()=>false;assert.match(c.performanceMetric('Contacted',2),/^<div /);
});
test('New count includes only uncontacted owners in the selected assignment period',()=>{
  const c=fixture();c.state={leads:[
    {status:'new',assignedAgentId:'owner',assignmentHistory:[{agentId:'owner',assignedAt:'2026-10-01T00:00:00Z'}]},
    {status:'contacted',assignedAgentId:'owner',assignmentHistory:[{agentId:'owner',assignedAt:'2026-10-01T00:00:00Z'}]},
    {status:'new',assignedAgentId:'other',assignmentHistory:[{agentId:'other',assignedAt:'2026-10-01T00:00:00Z'}]},
    {status:'new',assignedAgentId:'owner',assignmentHistory:[{agentId:'owner',assignedAt:'2026-09-01T00:00:00Z'}]},
  ]};
  assert.equal(c.salesNewLeadCount({from:'2026-10-01',to:'2026-10-04',rows:[{agent_id:'owner'}]}),1);
});
