// Local IndexedDB and RPC fixtures only; no real accounts or notifications.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});let checks=0;
try{for(const [name,device] of [['desktop',{}],['iphone',devices['iPhone 13']],['android',devices['Pixel 7']]]){
 const context=await browser.newContext({...device,serviceWorkers:'block'});const page=await context.newPage();
 await page.goto('http://127.0.0.1:8769/?demo=1');await page.waitForFunction(()=>typeof submitContactAction==='function'&&document.body.classList.contains('logged-out'));
 const result=await page.evaluate(async()=>{
  clearInterval(syncTimer);clearInterval(tickTimer);const agent=state.agents.find(a=>a.role==='agent');state.currentUserId=agent.id;
  remoteDatabaseMode=true;activeBrandId='fixture';brandContextVersion++;queueRemoteReload=()=>Promise.resolve(true);
  let calls=0,release;remoteDatabaseClient={rpc:()=>{calls++;return new Promise(r=>release=r)}};
  const action={actionId:crypto.randomUUID(),leadId:crypto.randomUUID(),agentId:agent.id,brandId:activeBrandId,assignmentRevision:1,state:'pending'};
  await writeContactOutbox(action);const first=flushContactOutbox(),second=flushContactOutbox();
  while(!release) await new Promise(r=>setTimeout(r,0));release({error:{code:'23503',message:'missing lead'}});await Promise.all([first,second]);
  const conflict=(await readContactOutbox(agent.id)).find(a=>a.actionId===action.actionId);await flushContactOutbox();const rejectedCalls=calls;
  await deleteContactOutbox(action.actionId);calls=0;
  remoteDatabaseClient={rpc:async()=>{calls++;return {error:{code:'57014',message:'timeout'}}}};
  await writeContactOutbox(action);await flushContactOutbox();const pending=(await readContactOutbox(agent.id))[0];await flushContactOutbox();
  const backedOffCalls=calls;remoteDatabaseClient={rpc:async()=>{calls++;return {data:{ok:true}}}};
  await writeContactOutbox({...pending,retryAfter:0});await flushContactOutbox();
  return {rejectedCalls,state:conflict.state,resolved:!!conflict.resolvedAt,backedOffCalls,pending:pending.state,retryAfter:pending.retryAfter>Date.now(),remaining:(await readContactOutbox(agent.id)).length};
 });
 assert.equal(result.rejectedCalls,1);checks++;assert.equal(result.state,'conflict');checks++;assert(result.resolved);checks++;assert.equal(result.backedOffCalls,1);checks++;assert.equal(result.pending,'pending');checks++;assert(result.retryAfter);checks++;assert.equal(result.remaining,0);checks++;
 console.log(`PASS ${name}: durable terminal rejection, coalescing, timeout backoff and successful retry`);await context.close();
}console.log(`PASS ${checks} contact retry browser assertions`)}finally{await browser.close()}
