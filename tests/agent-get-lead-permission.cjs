const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
test('Closed permission disables only GET LEAD with a clear explanation',()=>{
  const element=()=>({hidden:false,disabled:false,classList:{toggle(){}},setAttribute(){},textContent:''});
  const elements=Object.fromEntries(['agentLeadControls','getLeadButton','stopLeadButton','agentLeadStatus','agentLeadStatusMessage'].map(k=>[k,element()]));
  const user={role:'agent',getLeadAllowed:false,leadReady:false};
  const c=vm.createContext({elements,getCurrentUser:()=>user,isTeamSales:()=>false});
  vm.runInContext(source.slice(source.indexOf('function renderAgentLeadControls('),source.indexOf('\nfunction updateCountdown(')),c);
  c.renderAgentLeadControls();
  assert.equal(elements.agentLeadControls.hidden,false);
  assert.equal(elements.getLeadButton.disabled,true);
  assert.match(elements.agentLeadStatusMessage.textContent,/masih boleh mengurus lead sedia ada/);
  user.getLeadAllowed=true;c.renderAgentLeadControls();assert.equal(elements.getLeadButton.disabled,false);
});
test('GET LEAD has an early client gate and admin permission uses a server RPC',()=>{
  assert.match(source,/if \(ready && !isTeamSales\(\) && user.getLeadAllowed === false\)/);
  assert.match(source,/data-agent-get-lead-permission/);
  assert.match(source,/rpc\("admin_set_agent_get_lead_permission"/);
  assert.match(source,/getLeadAllowed: row.get_lead_allowed !== false/);
  assert.match(source,/if \(!isAdmin\(\) \|\| isTeamSales\(\)\) return false/);
});
