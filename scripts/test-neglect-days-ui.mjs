// Local browser fixtures only; no production lead or settings writes.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const {chromium,devices}=require('/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});let checks=0;
try{for(const [name,device] of [['desktop',{viewport:{width:1366,height:900}}],['iphone',devices['iPhone 13']],['android',devices['Pixel 7']]]){
 const context=await browser.newContext({...device,serviceWorkers:'block'});const page=await context.newPage();
 await page.goto('http://127.0.0.1:8769/?demo=1');await page.waitForFunction(()=>document.body.classList.contains('logged-out'));
 await page.evaluate(()=>{
  clearInterval(syncTimer);clearInterval(tickTimer);const me={...state.agents[0],id:'days-admin',role:'admin',active:true,approvalStatus:'approved'};
  state.agents=[me];state.currentUserId=me.id;activeBrandId='brand';activeBrand={id:'brand',active:true,distribution_mode:'agent',neglect_days:5};remoteDatabaseMode=true;
  window.__settingCalls=[];window.__cacheWrites=0;saveDashboardCache=()=>window.__cacheWrites++;guardLifecycleMutation=()=>true;
  remoteDatabaseClient={rpc:(name,args)=>{window.__settingCalls.push({name,args});return new Promise(resolve=>window.__finishSetting=resolve)}};
  document.body.classList.remove('logged-out','auth-pending');document.body.classList.add('authenticated');elements.appShell.setAttribute('aria-hidden','false');hideLifecycleSyncOverlay();renderNeglectSetting();
 });
 const form=page.locator('#neglect-setting-form'),input=form.locator('input'),save=form.getByRole('button',{name:'Simpan',exact:true});
 assert(await form.isVisible());checks++;assert.equal(await input.inputValue(),'5');checks++;
 await input.fill('2');await save.click();assert.equal(await page.evaluate(()=>window.__settingCalls.length),0);checks++;
 await input.fill('3.5');await save.click();assert.equal(await page.evaluate(()=>window.__settingCalls.length),0);checks++;
 await input.fill('3');await save.click();await page.waitForFunction(()=>window.__settingCalls.length===1);
 assert(await save.isDisabled());checks++;assert(await input.isDisabled());checks++;
 assert.equal(await page.evaluate(()=>activeBrand.neglect_days),5);checks++;
 assert.deepEqual(await page.evaluate(()=>window.__settingCalls[0]),{name:'admin_set_neglect_days',args:{p_days:3}});checks++;
 await page.evaluate(()=>window.__finishSetting({data:{ok:true,neglect_days:3}}));await page.waitForFunction(()=>!document.querySelector('#neglect-days-input').disabled);
 assert.equal(await input.inputValue(),'3');checks++;assert.match(await form.locator('[data-neglect-status]').innerText(),/Disimpan/);checks++;
 await input.fill('14');await save.click();await page.waitForFunction(()=>window.__settingCalls.length===2);await page.evaluate(()=>window.__finishSetting({error:{message:'Fixture timeout'}}));await page.waitForFunction(()=>!document.querySelector('#neglect-days-input').disabled);
 assert.equal(await input.inputValue(),'3');checks++;assert.equal(await page.evaluate(()=>activeBrand.neglect_days),3);checks++;assert.match(await form.locator('[data-neglect-status]').innerText(),/Fixture timeout/);checks++;
 await page.evaluate(()=>handleRemoteBroadcast({event:'neglect_settings_changed',payload:{brandId:'other',neglectDays:9}}));assert.equal(await page.evaluate(()=>activeBrand.neglect_days),3);checks++;
 await page.evaluate(()=>handleRemoteBroadcast({event:'neglect_settings_changed',payload:{brandId:'brand',neglectDays:15}}));assert.equal(await page.evaluate(()=>activeBrand.neglect_days),3);checks++;
 await page.evaluate(()=>handleRemoteBroadcast({event:'neglect_settings_changed',payload:{brandId:'brand',neglectDays:14}}));assert.equal(await input.inputValue(),'14');checks++;
 // A remote settings update may update the saved label but must preserve an edit.
 await input.fill('10');await page.evaluate(()=>handleRemoteBroadcast({event:'neglect_settings_changed',payload:{brandId:'brand',neglectDays:7}}));assert.equal(await input.inputValue(),'10');checks++;assert.match(await form.locator('[data-neglect-saved]').innerText(),/7 hari/);checks++;
 await input.fill('4');await save.click();await page.waitForFunction(()=>window.__settingCalls.length===3);
 await page.evaluate(()=>{activeBrandId='other';activeBrand={id:'other',active:true,distribution_mode:'agent',neglect_days:8};brandContextVersion++;renderNeglectSetting();window.__finishSetting({data:{ok:true,neglect_days:4}})});await page.waitForFunction(()=>!document.querySelector('#neglect-days-input').disabled);
 assert.equal(await input.inputValue(),'8');checks++;assert.equal(await page.evaluate(()=>activeBrand.neglect_days),8);checks++;assert.equal(await form.locator('[data-neglect-status]').innerText(),'');checks++;
 for(const [role,mode,visible] of [['master','agent',true],['agent','agent',false],['admin','team_sales',false],['master','team_sales',false],['admin','agent',true]]){
  await page.evaluate(({role,mode})=>{state.agents[0].role=role;activeBrand.distribution_mode=mode;renderNeglectSetting()},{role,mode});assert.equal(await form.isVisible(),visible);checks++;
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++;
 await form.evaluate(node=>window.scrollBy(0,node.getBoundingClientRect().top-120));
 await form.screenshot({path:`/tmp/leadlaju-neglect-days-${name}.png`});
 console.log(`PASS ${name}: setting scope, validation, pending/failed save, realtime draft and stale-brand response`);await context.close();
}console.log(`PASS ${checks} neglect setting UI assertions`)}finally{await browser.close()}
