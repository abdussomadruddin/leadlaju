// Clipboard fixture only; no production account, lead mutations or RPCs.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
let checks=0;
try {
 for(const [name,device] of [['desktop',{viewport:{width:1366,height:900}}],['iphone',devices['iPhone 13']],['android',devices['Pixel 7']]]) {
  const context=await browser.newContext({...device,reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();
  await page.addInitScript(()=>{
   window.__copies=[];
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copies.push(text)}}});
  });
  await page.goto('http://127.0.0.1:8769/?demo=1');
  await page.waitForFunction(()=>document.body.classList.contains('logged-out'));
  await page.evaluate(()=>{
   const agent=state.agents.find(a=>a.role==='agent');
   agent.active=true;agent.approvalStatus='approved';state.currentUserId=agent.id;
   activeBrandId='copy-fixture';activeBrand={id:activeBrandId,name:'Copy Fixture',active:true,distribution_mode:'team_sales'};
   remoteDatabaseMode=false;
   state.leads=[{id:'copy-fixture',name:'Fixture Name',phone:'60120000000',email:'fixture@example.invalid',project:'LG',source:'Tiktok',notes:'Fixture Name\n+60 12-0000000\nfixture@example.invalid\nYa',status:'new',queueState:'sales_assigned',assignedAgentId:agent.id,createdAt:Date.now(),receivedAt:Date.now(),assignmentRevision:1,followUpCount:0}];
   state.followUpDue=[];
   document.body.classList.remove('logged-out','auth-pending');document.body.classList.add('authenticated');
   elements.appShell.setAttribute('aria-hidden','false');
   hideLifecycleSyncOverlay();switchView('dashboard');renderAll();
  });
  for(const [view,selector] of [
   ['dashboard','#active-lead-container [data-lead-copy]'],
   ['leads','#leads-table-body [data-lead-copy]'],
   ['follow-up-due','#follow-up-due-list [data-follow-up-due-copy]'],
  ]) {
   await page.evaluate(view=>{switchView(view);if(view==='follow-up-due'){followUpSection='new';renderFollowUpDue()}},view);
   const button=page.locator(selector);await button.waitFor({state:'visible'});
   assert.equal(await button.isEnabled(),true);checks++;
   const before=await page.evaluate(()=>JSON.stringify(state.leads));
   const count=await page.evaluate(()=>window.__copies.length);
   await button.click();await page.waitForTimeout(80);
   assert.equal(await page.evaluate(()=>window.__copies.length),count+1,`${name} ${view}: exactly one clipboard write`);checks++;
   assert.equal(await page.evaluate(()=>JSON.stringify(state.leads)),before);checks++;
   const copied=await page.evaluate(()=>window.__copies.at(-1));
   assert.match(copied,/\*Inquiry For LG From Tiktok\*/);checks++;
   assert.match(copied,/No Phone: 60120000000/);checks++;
   assert.match(copied,/Nota Lain:\nYa$/);checks++;
  }
  const fallback=await page.evaluate(async()=>{
   const original=navigator.clipboard, exec=document.execCommand;
   let copied='', calls=0;
   document.execCommand=command=>{calls++;copied=document.activeElement.value;return command==='copy'};
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
   const missing=await copyLeadDetails('copy-fixture');
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Denied','NotAllowedError')}}});
   const denied=await copyLeadDetails('copy-fixture');
   document.execCommand=()=>false;
   const failed=await copyLeadDetails('copy-fixture');
   document.execCommand=exec;
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:original});
   return {missing,denied,failed,calls,copied,leftovers:document.querySelectorAll('[data-copy-fallback]').length};
  });
  assert.equal(fallback.missing,true,`${name}: missing Clipboard API fallback`);checks++;
  assert.equal(fallback.denied,true,`${name}: denied Clipboard API fallback`);checks++;
  assert.equal(fallback.failed,false);checks++;
  assert.equal(fallback.calls,2);checks++;
  assert.match(fallback.copied,/No Phone: 60120000000/);checks++;
  assert.equal(fallback.leftovers,0);checks++;
  const privacy=await page.evaluate(async()=>{
   const lead=state.leads[0],agent=getCurrentUser(),count=window.__copies.length;
   agent.role='admin';switchView('dashboard');renderActiveLead();
   const adminActions=elements.activeLeadContainer.querySelectorAll('[data-lead-copy], [data-sales-contact]').length;
   agent.role='agent';activeBrand.distribution_mode='agent';
   const agentNewBlocked=await copyLeadDetails(lead.id)===false;
   activeBrand.distribution_mode='team_sales';lead.assignedAgentId='other-owner';
   const otherOwnerBlocked=await copyLeadDetails(lead.id)===false;
   return {adminActions,agentNewBlocked,otherOwnerBlocked,unchanged:window.__copies.length===count};
  });
  assert.equal(privacy.adminActions,0);checks++;
  assert.equal(privacy.agentNewBlocked,true);checks++;
  assert.equal(privacy.otherOwnerBlocked,true);checks++;
  assert.equal(privacy.unchanged,true);checks++;
  await context.close();console.log(`PASS ${name}: New Copy on dashboard, Log Lead and Follow Up`);
 }
 console.log(`PASS ${checks} Team Sales copy browser assertions`);
} finally {await browser.close();}
