// Local browser integration with mocked transport. No production mutations.
import {createRequire} from 'node:module';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,devices}=require(process.env.LEADLAJU_PLAYWRIGHT_MODULE || '/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.env.LEADLAJU_TEST_URL || 'http://127.0.0.1:8769';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'leadlaju-neglected-ui-'));
const browser=await chromium.launch({channel:'chrome',headless:true});let checks=0;
try {
 for(const [name,device,mode] of [['desktop',{viewport:{width:1366,height:900}},'agent'],['iphone',devices['iPhone 13'],'agent'],['android',devices['Pixel 7'],'agent'],['sales',{viewport:{width:1366,height:900}},'team_sales']]){
  const context=await browser.newContext({...device,serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/runtime-config',r=>r.fulfill({json:{backend:'supabase',supabaseUrl:origin,supabasePublishableKey:'fixture'}}));
  await page.route('https://esm.sh/@supabase/supabase-js@2.116.0',r=>r.fulfill({contentType:'application/javascript',body:'export const createClient=()=>window.__fixtureClient;'}));
  await page.addInitScript(({mode})=>{
   const brand='00000000-0000-4000-8000-000000000001',user='10000000-0000-4000-8000-000000000001',agent='10000000-0000-4000-8000-000000000002';
   const profile={id:user,brand_id:brand,name:'Admin Fixture',email:'admin@fixture.invalid',role:'admin',active:true,approval_status:'approved'};
   window.__requests=[];window.__pool=[{id:'20000000-0000-4000-8000-000000000001',brand_id:brand,name:'Lead Terabai',phone:'60123456789',email:'fixture@example.invalid',project:'Projek Fixture',notes:'Nota asal\nBaris kedua',previous_owner:'Ejen Lama',previous_agent_id:agent,previous_status:'contacted',previous_follow_up:3,assignment_revision:4,created_at:'2026-10-01T00:00:00Z',last_activity_at:'2026-10-20T00:00:00Z',neglected_at:'2026-10-26T00:00:00Z'}];
   const rpc=async(name,args={})=>{
    window.__requests.push({name,args});
    if(name==='get_dashboard_state')return {data:{profiles:[profile,{id:agent,brand_id:brand,name:'Ejen Pilihan',email:'agent@fixture.invalid',role:'agent',active:true,approval_status:'approved',eligible_project_ids:['project']}],projects:[{id:'project',name:'Projek Fixture',active:true}],leads:[],events:[],appointments:[],server_now:new Date().toISOString()}};
    if(name==='get_neglected_leads_page')return {data:{brand_id:brand,total:window.__pool.length,has_more:false,rows:args.p_count_only?[]:window.__pool}};
    if(name==='admin_resolve_neglected'){const results=args.p_items.map(x=>({id:x.id,ok:true}));window.__pool=[];return {data:{ok:true,results}};}
    if(name==='get_follow_up_due')return {data:{leads:[],server_now:new Date().toISOString()}};
    if(name==='get_bulletin_feed')return {data:{bulletins:[],unread_count:0}};
    if(name==='get_agent_performance_report')return {data:{rows:[],weeks:[],from:args.p_from,to:args.p_to}};
    return {data:{ok:true}};
   };
   window.__fixtureClient={rpc,from:table=>{const q={select(){return q},eq(){return q},single:async()=>({data:table==='profiles'?profile:{id:brand,name:'Safrich',slug:'safrich',active:true,distribution_mode:mode}}),maybeSingle:async()=>({data:profile})};return q;},auth:{getSession:async()=>({data:{session:{user:{id:user}}}}),getUser:async()=>({data:{user:{id:user}}}),onAuthStateChange(){},signOut:async()=>({})},realtime:{setAuth:async()=>{}},channel:()=>{const c={on(){return c},subscribe(){return c}};return c;},removeChannel:async()=>{},functions:{invoke:async()=>({data:{ok:true}})}};
  },{mode});
  await page.goto(origin);await page.locator('#app-shell').waitFor({state:'visible'});
  await page.locator('#lifecycle-sync-overlay[aria-hidden="true"]').waitFor({state:'attached'});
  const nav=page.locator('.nav-item[data-view="neglected"]');
  if(mode==='team_sales') {assert.equal(await nav.isVisible(),false);checks++;await context.close();continue;}
  if((device.viewport?.width || 390)<850)await page.locator('#mobile-more-tab').click();
  await nav.click();await page.locator('.neglected-row').waitFor();
  assert.match(await page.locator('#neglected-rows').innerText(),/Ejen Lama/);checks++;
  assert.match(await page.locator('#neglected-rows').innerText(),/Baris kedua/);checks++;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${name}: no horizontal overflow`);checks++;
  await page.screenshot({path:path.join(artifacts,`${name}.png`),fullPage:true});
  await page.locator('#neglected-all').check();await page.locator('#neglected-target').selectOption('10000000-0000-4000-8000-000000000002');
  await page.locator('#neglected-assign').click();await page.waitForFunction(()=>window.__pool.length===0);
  await page.waitForFunction(()=>document.querySelector('#neglected-message').textContent.includes('1 berjaya'));
  const request=await page.evaluate(()=>window.__requests.find(x=>x.name==='admin_resolve_neglected'));
  assert.equal(request.args.p_mode,'assign');assert.equal(request.args.p_items[0].revision,4);checks+=2;
  await page.evaluate(()=>{
   state.currentUserId='10000000-0000-4000-8000-000000000002';
   state.leads=['manual-one','manual-two'].map(id=>({id,name:id,brandId:activeBrandId,project:'Projek Fixture',phone:'60123456789',email:'fixture@example.invalid',notes:'Nota asal\n60123456789\nfixture@example.invalid',status:'new',queueState:'active',adminAssigned:true,neglectedAt:new Date().toISOString(),assignmentRevision:5,statusRevision:2,assignedAgentId:state.currentUserId,receivedAt:Date.now(),createdAt:Date.now(),expiresAt:null,followUpCount:0,assignmentHistory:[]}));
   switchView('dashboard');renderAll();
  });
  assert.equal(await page.locator('[data-neglected-call]').count(),2);checks++;
  assert.equal(await page.locator('#active-lead-container').innerText().then(t=>t.includes('60123456789')||t.includes('fixture@example.invalid')),false,`${name}: New privacy`);checks++;
  assert.equal(await nav.isVisible(),false);checks++;
  await page.screenshot({path:path.join(artifacts,`${name}-agent.png`),fullPage:true});
  assert.deepEqual(errors,[],`${name}: no JS errors`);checks++;await context.close();
 }
 console.log(JSON.stringify({checks,artifacts}));
} finally {await browser.close();}
