// UI/RPC fixtures only: never changes a production credential.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const {chromium,devices}=require('/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});let checks=0;
try{for(const [name,device] of [['desktop',{viewport:{width:1366,height:900}}],['iphone',devices['iPhone 13']],['android',devices['Pixel 7']]]){
 const context=await browser.newContext({...device,serviceWorkers:'block'});const page=await context.newPage();
 await page.goto('http://127.0.0.1:8769/?demo=1');await page.waitForFunction(()=>document.body.classList.contains('logged-out'));
 await page.evaluate(async()=>{
  clearInterval(syncTimer);clearInterval(tickTimer);
  const me={...state.agents[0],id:'fixture-master',role:'master',active:true,approvalStatus:'approved',brandId:null};state.agents=[me];state.currentUserId=me.id;
  activeBrandId='brand';activeBrand={id:'brand',name:'Fixture Brand',slug:'fixture',active:true,distribution_mode:'agent'};remoteDatabaseMode=true;
  window.__passwordRequests=[];
  remoteDatabaseClient={rpc:async()=>({data:{brands:[activeBrand]}}),functions:{invoke:async(name,{body})=>{
   if(body.action==='list_admins')return {data:{ok:true,admins:[{id:'fixture-admin',brand_id:'brand',name:'Fixture Admin',email:'fixture@example.invalid',active:true}]}};
   window.__passwordRequests.push(body);return new Promise(resolve=>window.__completePassword=resolve);
  }}};
  document.body.classList.remove('logged-out','auth-pending');document.body.classList.add('authenticated');elements.appShell.setAttribute('aria-hidden','false');hideLifecycleSyncOverlay();switchView('brands');await loadMasterManagement();
 });
 const card=page.locator('#master-admin-list details');await card.locator('summary').click();const form=page.locator('[data-master-admin-password]');
 await form.locator('[name="password"]').fill('Fixture-Secret-123!');await form.locator('[name="confirmation"]').fill('Different-Secret');await form.getByRole('button',{name:'Tukar kata laluan',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__passwordRequests.length),0);checks++;assert.match(await form.locator('[role="alert"]').innerText(),/tidak sepadan/);checks++;
 await form.locator('[name="confirmation"]').fill('Fixture-Secret-123!');await form.getByRole('button',{name:'Tukar kata laluan',exact:true}).click();await page.waitForFunction(()=>!!window.__completePassword);
 assert.equal(await form.locator('[type="submit"]').isDisabled(),true);checks++;
 const request=await page.evaluate(()=>window.__passwordRequests[0]);assert.equal(request.action,'update_admin_password');checks++;assert.equal(request.userId,'fixture-admin');checks++;assert.equal(request.brand_id,'brand');checks++;
 await page.evaluate(()=>window.__completePassword({data:{ok:true,password_updated:true}}));await page.waitForFunction(()=>document.querySelector('[data-master-admin-password] [name="password"]').value==='');
 assert.equal(await form.locator('[name="confirmation"]').inputValue(),'');checks++;
 assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('Fixture-Secret-123!'))),false);checks++;
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++;
 await page.screenshot({path:`/tmp/leadlaju-master-password-${name}.png`,fullPage:true});
 console.log(`PASS ${name}: confirmation, one targeted RPC, immediate pending feedback and secret cleared`);await context.close();
}console.log(`PASS ${checks} Master Admin password UI assertions`)}finally{await browser.close()}
