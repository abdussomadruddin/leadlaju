const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(rpc){
 const writes=[],deletes=[];const action={agentId:'agent',brandId:'brand',actionId:'a',leadId:'gone',assignmentRevision:1};
 const context=vm.createContext({remoteDatabaseClient:{rpc},remoteDatabaseMode:true,navigator:{onLine:true},Date,
 writeContactOutbox:async a=>writes.push(a),deleteContactOutbox:async id=>deletes.push(id),readContactOutbox:async()=>[action],
 getCurrentUser:()=>({id:'agent',role:'agent'}),isTeamSales:()=>false,brandContextVersion:1,activeBrandId:'brand',salesContactStates:new Map(),queueRemoteReload:()=>{}});
 const s=fs.readFileSync('app.js','utf8');vm.runInContext(s.slice(s.indexOf('const contactActionFlights'),s.indexOf('async function loadRemoteDatabaseConfig')),context);
 return {context,writes,deletes,action};
}
for(const type of [undefined,'team_sales_contact']) for(const code of ['23503','42501','P0001','23505']) test(`${type||'agent'} ${code} stops retry`,async()=>{
 const f=fixture(async()=>({error:{code,message:'rejected'}}));
 await assert.rejects(f.context.submitContactAction({...f.action,actionType:type}),e=>e.authoritativeRejection===true);
 assert.equal(f.writes[0].state,'conflict');assert(f.writes[0].resolvedAt);
});
test('transient failure remains retryable with original action identity',async()=>{
 const f=fixture(async()=>({error:{code:'57014',message:'timeout'}}));
 await assert.rejects(f.context.submitContactAction(f.action),e=>!e.authoritativeRejection);assert.equal(f.writes[0].state,'pending');assert.equal(f.writes[0].actionId,'a');assert(f.writes[0].retryAfter>Date.now());
});
test('canonical rejection stops retry without success',async()=>{
 const f=fixture(async()=>({data:{ok:false,stale:true,error:'changed'}}));await assert.rejects(f.context.submitContactAction(f.action));assert.equal(f.writes[0].state,'conflict');assert.equal(f.deletes.length,0);
});
test('overlapping direct sends and flushes share one RPC',async()=>{
 let finish,calls=0;const f=fixture(()=>{calls++;return new Promise(r=>finish=r)});
 const a=f.context.submitContactAction(f.action);const b=f.context.submitContactAction(f.action);
 const c=f.context.flushContactOutbox();const d=f.context.flushContactOutbox();
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);finish({data:{ok:true}});await Promise.all([a,b,c,d]);assert.equal(f.deletes.length,1);
});

test('flush respects transient backoff instead of hammering the RPC',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return {data:{ok:true}}});
 f.context.readContactOutbox=async()=>[{...f.action,retryAfter:Date.now()+60000}];
 await f.context.flushContactOutbox();assert.equal(calls,0);
});
