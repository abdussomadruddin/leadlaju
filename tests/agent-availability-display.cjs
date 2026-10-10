const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
function context(){const c=vm.createContext({Date,remoteDatabaseMode:true,state:{},isTeamSales:()=>false});vm.runInContext(source.slice(source.indexOf('function agentAvailabilityNow('),source.indexOf('let agentAvailabilityDisplayKey')),c);return c;}
test('GET LEAD opt-in alone is not ready: require current lease, notification and access',()=>{
 const c=context(),now=1000;
 const a={active:true,approvalStatus:'approved',leadReady:true,presenceLeaseUntil:2000,notificationEnabled:true};
 assert.equal(c.agentLeadDisplayState(a,now),'ready');
 assert.equal(c.agentLeadDisplayState({...a,presenceLeaseUntil:1000},now),'expired');
 assert.equal(c.agentLeadDisplayState({...a,presenceLeaseUntil:undefined},now),'unverified');
 assert.equal(c.agentLeadDisplayState({...a,followUpDueBlocked:true},now),'blocked');
 assert.equal(c.agentLeadDisplayState({...a,getLeadAllowed:false},now),'denied');
 assert.equal(c.agentLeadDisplayState({...a,notificationEnabled:false},now),'notifications');
 assert.equal(c.agentLeadDisplayState({...a,cooldownUntil:2000},now),'cooldown');
 assert.equal(c.agentLeadDisplayState({...a,leadReady:false},now),'stopped');
 assert.equal(c.agentLeadDisplayState({...a,active:false},now),'inactive');
});
test('Expiry clock uses authoritative server time and preserves legacy local mode',()=>{
 const c=context();c.state={followUpServerNow:Date.now()+60000,followUpLoadedAt:Date.now()};
 assert.ok(c.agentAvailabilityNow()>Date.now()+59000);
 c.remoteDatabaseMode=false;assert.equal(c.agentPresenceIsCurrent({online:true}),true);
});
test('Timer rechecks availability without changing the server readiness toggle',()=>{
 const tick=source.slice(source.indexOf('function updateAgentAvailabilityDisplay('),source.indexOf('function renderAgentLeadControls('));
 assert.match(tick,/key === agentAvailabilityDisplayKey/);assert.doesNotMatch(tick,/leadReady\s*=|\.rpc\(/);
 assert.match(source,/presenceLeaseUntil: row.presence_lease_until/);
});
test('Expired own session enables GET LEAD and keeps stop available to cancel opt-in',()=>{
 const c=context();const element=()=>({classList:{toggle(){}},setAttribute(){}});
 c.elements=Object.fromEntries(['agentLeadControls','getLeadButton','stopLeadButton','agentLeadStatus','agentLeadStatusMessage'].map(k=>[k,element()]));
 const a={role:'agent',active:true,approvalStatus:'approved',leadReady:true,notificationEnabled:true,presenceLeaseUntil:Date.now()+60000};
 c.getCurrentUser=()=>a;
 vm.runInContext(source.slice(source.indexOf('function renderAgentLeadControls('),source.indexOf('function updateCountdown(')),c);
 c.renderAgentLeadControls();assert.equal(c.elements.getLeadButton.disabled,true);
 a.presenceLeaseUntil=Date.now()-1000;c.renderAgentLeadControls();
 assert.equal(c.elements.getLeadButton.disabled,false);assert.equal(c.elements.stopLeadButton.disabled,false);
 assert.match(c.elements.agentLeadStatus.textContent,/Sesi GET LEAD tamat/);
 a.followUpDueBlocked=true;c.renderAgentLeadControls();assert.match(c.elements.agentLeadStatus.textContent,/Follow Up Due/);
 a.getLeadAllowed=false;c.renderAgentLeadControls();assert.equal(c.elements.getLeadButton.disabled,true);
});
