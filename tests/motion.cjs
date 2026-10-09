const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
test('Navigation entrances are bounded, cancellable and respect reduced motion',()=>{
 let reduced=false;const calls=[];
 const card={getClientRects:()=>[{}],getAnimations:()=>[],animate:(frames,options)=>{calls.push({frames,options});return {};}};
 const view={...card,querySelectorAll:()=>Array(30).fill(card)};
 const c=vm.createContext({window:{matchMedia:()=>({matches:reduced})}});
 vm.runInContext(source.slice(source.indexOf('function animateViewEntrance('),source.indexOf('function syncMobileNavigation(')),c);
 c.animateViewEntrance(view);assert.equal(calls.length,13);
 assert.ok(calls.every(x=>x.options.delay<=96&&x.options.duration<=360));
 reduced=true;c.animateViewEntrance(view);assert.equal(calls.length,13);
});
test('Background reconciliation never starts entrance animation',()=>{
 const sync=source.slice(source.indexOf('function renderDashboardUpdates('),source.indexOf('function openContactOutbox('));
 assert.doesNotMatch(sync,/animateViewEntrance|animateTabTransition/);
 assert.match(source,/press.id = "leadlaju-press"/);
});
test('Tab slides use one 320ms lower-left animation and cancel rapid transitions',()=>{
 let reduced=false,cancelled=0;const calls=[];
 const view={getAnimations:()=>[],animate:(frames,options)=>{calls.push({frames,options});return {cancel(){cancelled++;}};}};
 const c=vm.createContext({window:{matchMedia:()=>({matches:reduced})}});
 vm.runInContext(source.slice(source.indexOf('let tabTransitionAnimation ='),source.indexOf('function syncMobileNavigation(')),c);
 c.animateTabTransition(view);assert.equal(calls.length,1);
 assert.equal(calls[0].frames[0].translate,'-24px 18px');assert.equal(calls[0].options.duration,320);
 c.animateTabTransition(view);assert.equal(cancelled,1);
 reduced=true;c.animateTabTransition(view);assert.equal(cancelled,2);assert.equal(calls.length,2);
 const change=source.slice(source.indexOf('function switchView('),source.indexOf('function openAgentModal('));
 assert.match(change,/behavior: "instant"/);assert.doesNotMatch(change,/animateViewEntrance|behavior:.*"smooth"/);
 assert.ok(change.indexOf('window.scrollTo(')<change.indexOf('animateTabTransition(targetView)'));
});
