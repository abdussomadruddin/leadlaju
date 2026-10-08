const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('Due percent uses all currently owned leads and the selected project, not recent assignments',()=>{
 const source=fs.readFileSync('app.js','utf8');
 const c=vm.createContext({elements:{performanceProject:{value:''}},state:{projects:[{id:'p',name:'Project'}],leads:[{assignedAgentId:'a',project:'Project'},{assignedAgentId:'a',project:'Other'},{assignedAgentId:'b',project:'Project'}]}});
 vm.runInContext(source.slice(source.indexOf('function performanceDueSummary('),source.indexOf('function performanceMetric(')),c);
 assert.equal(c.performanceDueSummary({agent_id:'a',due_now:1,assignments:0}).percent,'50.0%');
 c.elements.performanceProject.value='p';
 assert.equal(c.performanceDueSummary({agent_id:'a',due_now:1}).percent,'100.0%');
 assert.equal(c.performanceDueSummary({agent_id:'empty',due_now:0}).percent,'—');
});
