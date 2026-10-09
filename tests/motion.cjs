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
 assert.doesNotMatch(sync,/animateViewEntrance/);
 assert.match(source,/press.id = "leadlaju-press"/);
});
