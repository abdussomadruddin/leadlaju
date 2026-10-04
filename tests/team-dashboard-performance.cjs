const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
function fixture() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {textContent:'',innerHTML:'',setAttribute(){},replaceChildren(){this.innerHTML='';},querySelectorAll(){return [];}});
    return nodes.get(id);
  };
  const requests = [];
  const c = vm.createContext({ document:{querySelector:node}, performanceMetric:(label,value,detail)=>JSON.stringify({label,value,detail}),
    isAdmin:()=>true,isTeamSales:()=>true, remoteDatabaseMode:true,
    remoteDatabaseClient:{rpc:async(name,args)=>new Promise(resolve=>requests.push({name,args,resolve}))},
    state:{currentUserId:'admin'},brandContextVersion:1,teamPerformanceDays:7,
    teamPerformanceCache:new Map(),teamPerformancePending:new Set(),performanceDateOffset:n=>n===0?'2026-10-02':'2026-09-26',todayKey:()=> '2026-10-02',Date,console });
  vm.runInContext(app.slice(app.indexOf('function salesNewLeadCount('),app.indexOf('\nfunction performanceRange(')),c);
  return {c,node,requests};
}
const report={from:'2026-09-26',to:'2026-10-02',rows:[{assignments:3,total_contacted:2,due_now:1},{assignments:4,total_contacted:3,due_now:2}]};
test('Team dashboard aggregates server rows, not truncated dashboard activity',()=>{
  const {c,node}=fixture();c.renderTeamPerformance(report);
  assert.match(node('#team-performance-metrics').innerHTML,/"label":"Lead ditugaskan","value":7/);
  assert.match(node('#team-performance-metrics').innerHTML,/"label":"Contacted","value":5/);
  assert.match(node('#team-performance-metrics').innerHTML,/"label":"Follow Up Due","value":3/);
  assert.doesNotMatch(node('#team-performance-metrics').innerHTML,/CALL NOW|within_five/);
  c.renderTeamPerformance({...report,rows:[]});assert.match(node('#team-performance-status').textContent,/Tiada lead ditugaskan/);
});
test('Team report uses 1 or 7 days and cached results; old period cannot replace selected period',async()=>{
  const {c,node,requests}=fixture();const seven=c.loadTeamPerformance();
  assert.equal(requests[0].args.p_agent_id,null);assert.equal(requests[0].args.p_from,'2026-09-26');
  c.teamPerformanceDays=1;const one=c.loadTeamPerformance();assert.equal(requests[1].args.p_from,requests[1].args.p_to);
  requests[1].resolve({data:{...report,from:'2026-10-02',rows:[{assignments:1}]}});await one;
  requests[0].resolve({data:report});await seven;
  assert.match(node('#team-performance-metrics').innerHTML,/"value":1/);
  c.teamPerformanceDays=7;await c.loadTeamPerformance();assert.equal(requests.length,2);
  assert.match(node('#team-performance-metrics').innerHTML,/"value":7/);
});
test('Late brand responses are discarded and agent cannot request team report',async()=>{
  const {c,node,requests}=fixture();const pending=c.loadTeamPerformance();c.brandContextVersion++;
  requests[0].resolve({data:report});await pending;assert.equal(c.teamPerformanceCache.size,0);assert.equal(node('#team-performance-metrics').innerHTML,'');
  c.isAdmin=()=>false;await c.loadTeamPerformance();assert.equal(requests.length,1);
});
test('Compact cards are scoped to Team Sales and admin panel is gated',()=>{
  assert.match(html,/id="team-performance" hidden/);
  assert.match(html,/data-team-performance-days="1"/);assert.match(html,/data-team-performance-days="7"/);
  assert.match(app,/hidden = !isAdmin\(\) \|\| !isTeamSales\(\)/);
  assert.match(css,/\.team-sales-brand #dashboard-view \.performance-metrics \{ grid-template-columns: repeat\(3/);
  assert.match(app,/renderNewLeadNotes\(item\)\}\$\{isAdmin\(\) \? "" : `<div class="sales-lead-actions">/);
});
