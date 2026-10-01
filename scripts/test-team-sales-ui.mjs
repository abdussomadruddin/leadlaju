// Real browser interactions with mocked Supabase; no real calls, users or emails.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,devices}=require(process.env.LEADLAJU_PLAYWRIGHT_MODULE||'/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ExcelJS=require('exceljs');
const origin=process.env.LEADLAJU_TEST_URL||'http://127.0.0.1:8769';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'leadlaju-sales-ui-'));
const browser=await chromium.launch({channel:'chrome',headless:true});
let checks=0;
try {
 for(const [name,device] of [['desktop',{viewport:{width:1366,height:900}}],['iphone',devices['iPhone 13']],['android',devices['Pixel 7']],['small-phone',{viewport:{width:320,height:568},isMobile:true,hasTouch:true}]]) {
  for(const role of ['agent','master']) {
   const context=await browser.newContext({...device,serviceWorkers:'block'});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/runtime-config',r=>r.fulfill({json:{backend:'supabase',supabaseUrl:origin,supabasePublishableKey:'fixture'}}));
   await page.route('https://esm.sh/@supabase/supabase-js@2.116.0',r=>r.fulfill({contentType:'application/javascript',body:'export const createClient=(url,key,options)=>window.__client(options);'}));
   await page.route('**/sales-stamp',r=>r.fulfill({json:{brand:r.request().headers()['x-leadlaju-brand']}}));
   await page.addInitScript(({role})=>{
    const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',uid='10000000-0000-4000-8000-000000000001';
    window.__uid=uid;window.__salesBrand=b;window.__requests=[];window.__fail=false;
    const brands=[{id:a,name:'Safrich',slug:'safrich',active:true,distribution_mode:'agent'},{id:b,name:'Sales Brand',slug:'sales-brand',active:true,distribution_mode:'team_sales'}];
    const profile={id:uid,name:'Fixture Account',role,brand_id:role==='master'?null:b,email:'fixture@test.invalid',active:true,approval_status:'approved',eligible_project_ids:[]};
    const leads=[1,2,3].map(n=>({id:`sales-lead-${n}`,brand_id:b,name:`Sales Lead ${n} with a long readable name`,phone:'60120000000',email:'lead@test.invalid',project:'Sales Project',status:'new',queue_state:'sales_assigned',assigned_agent_id:uid,assignment_revision:1,status_revision:0,follow_up_count:0,received_at:new Date().toISOString(),created_at:new Date().toISOString()}));
    const report=args=>({from:args.p_from,to:args.p_to,generated_at:new Date().toISOString(),rows:[{agent_id:uid,agent_name:'Fixture Account',assignments:3,total_contacted:1,total_follow_up:0,total_potential:0,total_cancelled_rejected:0,total_client:0,appointments:0,show_ups:0,due_now:0,within_five:1}],weeks:[{agent_id:uid,week_start:args.p_from,assignments:3,total_contacted:1,appointments:0,show_ups:0,within_five:1}]});
    window.__client=options=>({auth:{getSession:async()=>({data:{session:{user:{id:uid}}}}),getUser:async()=>({data:{user:{id:uid}}})},from:table=>{
      const f={};const q={select(){return q},eq(k,v){f[k]=v;return q},single:async()=>({data:table==='profiles'?profile:brands.find(x=>x.id===f.id)}),maybeSingle:async()=>({data:profile})};return q;
    },rpc:async(name,args={})=>{
      const stamp=await options.global.fetch('/sales-stamp');const brand=(await stamp.json()).brand||a;window.__requests.push({name,args,brand});
      if(name==='master_manage_brand')return {data:{ok:true,brands}};
      if(name==='get_dashboard_state')return {data:{profiles:[profile],projects:[],leads:brand===b?leads:[],appointments:[],activities:[],events:[],server_now:new Date().toISOString()}};
      if(name==='get_bulletin_feed')return {data:{bulletins:[],unread_count:0}};
      if(name==='get_follow_up_due')return {data:{leads:[]}};
      if(name==='get_agent_performance_report')return {data:report(args)};
      if(name==='team_sales_contact'){
        await new Promise(r=>setTimeout(r,150));
        if(window.__fail)return {error:{code:'FETCH',message:'Simulated network interruption'}};
        const l=leads.find(x=>x.id===args.p_lead_id);if(l.status==='new'){l.status='contacted';l.queue_state='contacted';l.status_revision++;}return {data:{ok:true,lead:l}};
      }
      return {data:{ok:true}};
    },functions:{invoke:async()=>({data:{ok:true,admins:[],integrations:[]}})},realtime:{setAuth:async()=>{}},channel:()=>{const c={on(){return c},subscribe(){return c}};return c},removeChannel:async()=>{}});
   },{role});
   await page.goto(origin);await page.locator('#app-shell').waitFor({state:'visible'});
   if(role==='master'){
    await page.locator('#master-brand-switcher').selectOption('00000000-0000-4000-8000-000000000002');
   }
   await page.waitForFunction(()=>document.body.classList.contains('team-sales-brand'));
   // This fixture bypasses only the existing PWA access modal, never production auth.
   if(role==='agent')await page.evaluate(()=>{getAgentAppAccessState=()=> 'ready';ensureAgentPushAccess=async()=>true;agentPushAccessReady=true;renderAgentAccessGate('ready');renderAll();});
   if(role==='agent'){
    const order=()=>page.evaluate(()=>[...document.querySelector('#dashboard-view').children].filter(el=>el.matches('#own-performance,.new-lead-section,#dashboard-follow-up')).map(el=>el.id||'new-leads'));
    assert.deepEqual(await order(),['own-performance','new-leads','dashboard-follow-up']);checks++;
    assert.equal(await page.locator('#own-performance').isVisible(),true);checks++;
    assert.equal(await page.locator('#dashboard-follow-up').isVisible(),true);checks++;
    const boxes=await page.evaluate(()=>['#own-performance','.new-lead-section','#dashboard-follow-up'].map(selector=>document.querySelector('#dashboard-view '+selector).getBoundingClientRect().top));
    assert.ok(boxes[0]<boxes[1]&&boxes[1]<boxes[2]);checks++;
    assert.equal(await page.locator('#dashboard-view .stats-grid').isVisible(),false);checks++;
    await page.evaluate(()=>{activeBrand.distribution_mode='agent';renderUser();});
    assert.deepEqual(await order(),['new-leads','own-performance','dashboard-follow-up']);checks++;
    await page.evaluate(()=>{activeBrand.distribution_mode='team_sales';renderAll();});
    assert.deepEqual(await order(),['own-performance','new-leads','dashboard-follow-up']);checks++;
   }
   assert.equal(await page.locator('.sales-lead-card').count(),3);checks++;
   assert.equal(await page.locator('#agent-lead-controls').isVisible(),false);checks++;
   assert.equal(await page.locator('#dashboard-view').innerText().then(t=>/CALL NOW|GET LEAD|STOP LEAD|≤5 min|5 minit|Sasaran 5m|Giliran agihan/.test(t)),false);checks++;
   await page.evaluate(()=>{playNotificationSound=async()=>{};return sendSystemNotification(state.leads[0],{force:true,toast:true});});
   assert.equal(await page.locator('#toast-message').innerText().then(t=>/CALL NOW|5 minit/.test(t)),false);checks++;
   assert.equal(await page.locator('#nav-lead-count').innerText(),'3');checks++;
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}: no overflow`);checks++;
   const call=page.locator('.sales-lead-card [data-sales-contact="call"]').first();
   assert.match(await call.getAttribute('href'),/^tel:/);checks++;
   // Preserve actual button handlers but suppress external phone navigation in QA.
   await call.evaluate(el=>el.href='javascript:void(0)');await call.click();
   await page.waitForFunction(()=>window.__requests.some(r=>r.name==='team_sales_contact'));
   await page.waitForFunction(()=>document.querySelectorAll('.sales-lead-card').length===2);
   assert.equal(await page.evaluate(()=>window.__requests.find(r=>r.name==='team_sales_contact').args.p_channel),'call');checks++;
   const wa=page.locator('.sales-lead-card [data-sales-contact="whatsapp"]').first();
   assert.match(await wa.getAttribute('href'),/wa.me/);checks++;
   await page.evaluate(()=>window.__fail=true);await wa.evaluate(el=>el.href='javascript:void(0)');await wa.click();
   await page.waitForFunction(()=>document.querySelector('.sales-contact-state')?.textContent.includes('Belum disahkan'));
   assert.equal(await page.locator('.sales-lead-card').count(),2,'Pending action is not falsely marked Contacted');checks++;
   await page.waitForTimeout(250);await page.evaluate(()=>{window.__fail=false;return flushContactOutbox();});
   await page.waitForFunction(()=>document.querySelectorAll('.sales-lead-card').length===1);
   assert.equal(await page.evaluate(()=>state.leads.every(l=>l.followUpCount===0)),true,'Ordinary WA does not increment Follow Up');checks++;
   await page.screenshot({path:path.join(artifacts,`${name}-${role}-dashboard.png`),fullPage:true});
   await page.evaluate(()=>switchView('leads'));
   assert.equal((await page.locator('#leads-view th').nth(1).textContent()).trim(),'Produk');checks++;
   assert.equal(await page.locator('#leads-view [data-label="Produk"]').count(),3);checks++;
   assert.match(await page.locator('.lead-note-field').first().getAttribute('placeholder'),/minat produk/);checks++;
   assert.equal(await page.locator('#appointment-project-filter option').first().innerText(),'Semua produk');checks++;
   await page.evaluate(()=>{renderAppointments();renderFollowUpDue();});
   assert.equal(await page.locator('#appointment-project-filter option').first().innerText(),'Semua produk','Direct filter render preserves terminology');checks++;
   assert.equal((await page.locator('.sidebar .brand small').textContent()).trim(),'Lead Management');checks++;
   assert.equal(await page.locator('#project-name').getAttribute('placeholder'),'Nama produk');checks++;
   assert.equal(await page.locator('#projects-view h2').innerText(),'Produk');checks++;
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}: lead controls fit`);checks++;
   assert.equal(await page.locator('#leads-view [data-sales-contact="whatsapp"]').count(),3);checks++;
   await page.screenshot({path:path.join(artifacts,`${name}-${role}-leads.png`),fullPage:true});
   if(role==='master'){
    await page.evaluate(()=>switchView('performance'));await page.waitForFunction(()=>document.querySelector('#performance-cards').children.length>0);
    await page.locator('#performance-cards summary').first().click();
    assert.equal(await page.locator('#performance-view').innerText().then(t=>/CALL NOW|≤5 min/.test(t)),false);checks++;
    const downloadPromise=page.waitForEvent('download');await page.locator('#performance-download').click();const download=await downloadPromise;
    const file=path.join(artifacts,`${name}-sales.xlsx`);await download.saveAs(file);
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(file);
    assert.equal(workbook.worksheets.length,2);checks++;
    assert.equal(workbook.worksheets[0].name,'Ringkasan Team Sales');checks++;
    assert.equal(workbook.worksheets[0].getRow(2).getCell(1).value,'Produk');checks++;
    assert.equal(workbook.worksheets[0].getRow(2).getCell(2).value,'Semua produk');checks++;
    assert.equal(workbook.worksheets[0].getRow(4).getCell(2).value,3);checks++;
    assert.equal(workbook.worksheets.some(s=>s.getSheetValues().flat(2).some(v=>/CALL NOW|≤5 min/.test(String(v)))),false);checks++;
    await page.locator('#master-brand-switcher').selectOption('00000000-0000-4000-8000-000000000001');
    await page.waitForFunction(()=>!document.body.classList.contains('team-sales-brand'));
    assert.equal(await page.locator('.sales-lead-card').count(),0,'Brand switching clears Sales cards');checks++;
    assert.equal(await page.locator('#projects-view h2').innerText(),'Projek','Safrich retains original terminology');checks++;
    assert.equal(await page.locator('#project-name').getAttribute('placeholder'),'Nama projek');checks++;
    await page.evaluate(()=>switchView('performance'));await page.waitForFunction(()=>document.querySelector('#performance-cards').children.length>0);
    await page.locator('#performance-cards summary').first().click();
    assert.match(await page.locator('#performance-view').innerText(),/CALL NOW ≤5 min/);checks++;
   }
   assert.deepEqual(errors,[]);checks++;await context.close();
  }
 }
 console.log(`PASS: ${checks} Team Sales desktop/iPhone/Android assertions, mocked transport. Artifacts: ${artifacts}`);
} finally {await browser.close();}
