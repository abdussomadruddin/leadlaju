const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js', 'utf8');
const source = app.slice(app.indexOf('async function syncPushSubscription('), app.indexOf('async function playNotificationSound('));
const conflict = {code:'42501', message:'new row violates row-level security policy (USING expression) for table "push_subscriptions"'};
function fixture({errors=[conflict,null], unsubscribe=true, replacement='new', delay=0}={}) {
  const calls=[], stored=new Map(); let removals=0, subscriptions=0;
  let user={id:'sales-owner',active:true,email:'test@invalid'};
  const sub=endpoint=>({endpoint,toJSON:()=>({endpoint,keys:{p256dh:'fixture-key',auth:'fixture-auth'}}),unsubscribe:async()=>{removals++;return unsubscribe;}});
  const context=vm.createContext({Notification:{permission:'granted'},navigator:{userAgent:'iPhone'},isPushSupported:()=>true,getCurrentUser:()=>user,
    registerServiceWorker:async()=>({pushManager:{getSubscription:async()=>sub('old'),subscribe:async()=>{subscriptions++;return sub(replacement);}}}),
    WEB_PUSH_PUBLIC_KEY:'fixture',urlBase64ToUint8Array:()=>[],remoteDatabaseMode:true,
    remoteDatabaseClient:{rpc:async(name,args)=>{calls.push({name,args});if(delay)await new Promise(r=>setTimeout(r,delay));return {error:errors[calls.length-1],data:{ok:true}};}},
    localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
  });
  vm.runInContext('let pushSubscriptionSyncPromise=null;'+source,context);
  return {sync:force=>context.syncPushSubscription(force),calls,stored,counts:()=>({removals,subscriptions}),changeUser:()=>{user={id:'other',active:true};}};
}
test('explicit reconnect replaces cross-brand browser endpoint, not server RLS or ownership',async()=>{
  const f=fixture();assert.equal(await f.sync(true),true);
  assert.deepEqual(f.counts(),{removals:1,subscriptions:1});
  assert.deepEqual(f.calls.map(c=>c.args.p_endpoint),['old','new']);
  assert.deepEqual(Object.keys(f.calls[1].args).sort(),['p_auth','p_endpoint','p_p256dh','p_user_agent']);
  assert.match(f.stored.get('leadlaju-push-subscription-owner'),/^sales-owner:new:/);
});
test('background validation never rotates an endpoint without explicit reconnect',async()=>{
  const f=fixture();await assert.rejects(f.sync(false),e=>e.code==='42501');assert.equal(f.counts().removals,0);
});
test('ordinary Safrich registration keeps existing subscription',async()=>{
  const f=fixture({errors:[null]});assert.equal(await f.sync(true),true);assert.deepEqual(f.counts(),{removals:0,subscriptions:0});
});
test('network and unrelated permission errors never rotate browser subscription',async()=>{
  for(const error of [{code:'FETCH',message:'Network unavailable'},{code:'42501',message:'permission denied for table brands'}]){
    const f=fixture({errors:[error]});await assert.rejects(f.sync(true));assert.equal(f.counts().removals,0);assert.equal(f.calls.length,1);
  }
});
test('failed unsubscribe and same replacement endpoint fail closed',async()=>{
  for(const settings of [{unsubscribe:false},{replacement:'old'}]){
    const f=fixture(settings);await assert.rejects(f.sync(true));assert.equal(f.calls.length,1);assert.equal(f.stored.size,0);
  }
});
test('second registration failure never loops or stores success',async()=>{
  const f=fixture({errors:[conflict,conflict]});await assert.rejects(f.sync(true));assert.equal(f.calls.length,2);assert.equal(f.counts().removals,1);assert.equal(f.stored.size,0);
});
test('parallel background sync shares one operation',async()=>{
  const f=fixture({errors:[null],delay:15});assert.deepEqual(await Promise.all([f.sync(false),f.sync(false)]),[true,true]);assert.equal(f.calls.length,1);
});
test('logout/account change cannot persist old account readiness',async()=>{
  const f=fixture({errors:[null],delay:15});const p=f.sync(true);f.changeUser();assert.equal(await p,false);assert.equal(f.stored.size,0);
});
test('notification permission alone is not shown as successful server registration',()=>{
  const request=app.slice(app.indexOf('async function requestNotifications('),app.indexOf('function expiryAssignmentKey('));
  assert.match(request,/notificationRequestInProgress = false/);
  assert.match(request,/subscribed \? "Notifikasi aktif" : "Notifikasi belum disambungkan"/);
  assert.match(request,/subscribed \? "success" : "error"/);
  assert.match(request,/await Notification\.requestPermission\(\)[\s\S]*playNotificationSound\(\)\.catch/);
  assert.doesNotMatch(request,/await playNotificationSound/);
});
