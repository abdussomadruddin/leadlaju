// Synthetic sessions only; no production login or lead writes.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
let checks=0;
try {
 for(const [name,device] of [['desktop',{}],['iphone',devices['iPhone 13']],['android',devices['Pixel 7']]]) {
  const context=await browser.newContext({...device,serviceWorkers:'block'});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:8769/?demo=1');
  await page.waitForFunction(()=>document.body.classList.contains('logged-out'));
  const result=await page.evaluate(async()=>{
   window.clearInterval(syncTimer);window.clearInterval(tickTimer);
   const user=state.agents.find(a=>a.role==='admin');state.currentUserId=user.id;
   activeBrandId='test-brand';brandContextVersion++;remoteDatabaseMode=true;
   const calls=[],callbacks=[];let resolveSession;
   const session={user:{id:user.id},access_token:'fixture-token'};
   remoteDatabaseClient={auth:{getSession:()=>new Promise(resolve=>resolveSession=resolve)},
    realtime:{setAuth:async token=>calls.push(['auth',token])},removeChannel:async()=>{},
    channel:topic=>({on(){return this},subscribe(callback){calls.push(['subscribe',topic]);callbacks.push(callback);return this}})};
   remoteRealtimeChannels=[];queueRemoteReload=()=>Promise.resolve(true);
   const first=subscribeToRemoteDatabase();
   await Promise.resolve();await Promise.resolve();
   const before=calls.length;
   resolveSession({data:{session}});await first;
   const initial=calls.slice();
   callbacks[0]('CHANNEL_ERROR');callbacks[1]('TIMED_OUT');
   const retry={attempts:realtimeReconnectAttempts,timer:!!realtimeReconnectTimer};
   callbacks[0]('SUBSCRIBED');callbacks[1]('SUBSCRIBED');
   const recovered=realtimeReconnectAttempts===0 && !realtimeReconnectTimer;
   for(let i=0;i<5;i++) {callbacks[0]('CHANNEL_ERROR');window.clearTimeout(realtimeReconnectTimer);realtimeReconnectTimer=null;}
   const capped=realtimeReconnectAttempts===3;
   remoteDatabaseClient.auth.getSession=async()=>({data:{session:{...session,user:{id:'other-user'}}}});
   const count=calls.length;await subscribeToRemoteDatabase();
   const mismatchNoSubscribe=calls.length===count;
   window.clearTimeout(realtimeReconnectTimer);realtimeReconnectTimer=null;
   remoteDatabaseClient.auth.getSession=async()=>({data:{session}});
   const pending=subscribeToRemoteDatabase();brandContextVersion++;await pending;
   const staleNoSubscribe=calls.length===count;
   window.clearTimeout(realtimeReconnectTimer);realtimeReconnectTimer=null;
   return {before,initial,retry,recovered,capped,mismatchNoSubscribe,staleNoSubscribe};
  });
  assert.equal(result.before,0);checks++;
  assert.deepEqual(result.initial[0],['auth','fixture-token']);checks++;
  assert.equal(result.initial.filter(c=>c[0]==='subscribe').length,2);checks++;
  assert.deepEqual(result.retry,{attempts:1,timer:true});checks++;
  assert.equal(result.recovered,true);checks++;
  assert.equal(result.capped,true);checks++;
  assert.equal(result.mismatchNoSubscribe,true);checks++;
  assert.equal(result.staleNoSubscribe,true);checks++;
  await context.close();console.log(`PASS ${name}: token before subscribe, bounded retry, stale account and brand rejected`);
 }
 console.log(`PASS ${checks} admin realtime session assertions`);
} finally {await browser.close()}
