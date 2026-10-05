const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
test('button starts action immediately and clears waiting feedback on success and failure',async()=>{
 const attrs=new Map(),classes=new Set();let removed=0;
 const button={dataset:{},getAttribute:key=>attrs.get(key)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},append:()=>{}};
 const context={document:{createElement:()=>({setAttribute:()=>{},remove:()=>removed++})}};
 vm.runInNewContext(source.slice(source.indexOf('const pendingButtonFeedback ='),source.indexOf('function showImmediatePressFeedback')),context);
 let finish,started=false;
 const waiting=context.runButtonActionFeedback(button,()=>{started=true;return new Promise(resolve=>finish=resolve)});
 assert.equal(started,true);assert.equal(button.dataset.actionPending,'true');assert.equal(attrs.get('aria-busy'),'true');
 finish();await waiting;assert.equal(button.dataset.actionPending,undefined);assert.equal(attrs.has('aria-busy'),false);
 await assert.rejects(context.runButtonActionFeedback(button,()=>Promise.reject(new Error('offline'))),/offline/);
 assert.equal(classes.size,0);assert.equal(removed,2);
});
test('retired Passed and dashboard-only grouped filters are not offered in Log Lead',()=>{
 assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/value="passed"/);
 assert.match(source, /option\.hidden = true/);
 assert.match(source, /if \(lead\.status === "passed"\) return "rejected"/);
});
