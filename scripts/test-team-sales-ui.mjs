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
  for(const role of ['agent','admin','master']) {
   console.log(`Checking ${name} ${role}`);
   const context=await browser.newContext({...device,serviceWorkers:'block'});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   page.setDefaultTimeout(20000);
   await page.route('**/api/runtime-config',r=>r.fulfill({json:{backend:'supabase',supabaseUrl:origin,supabasePublishableKey:'fixture'}}));
   await page.route('https://esm.sh/@supabase/supabase-js@2.116.0',r=>r.fulfill({contentType:'application/javascript',body:'export const createClient=(url,key,options)=>window.__client(options);'}));
   await page.route('**/sales-stamp',r=>r.fulfill({json:{brand:r.request().headers()['x-leadlaju-brand']}}));
   await page.addInitScript(({role})=>{
    const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',uid='10000000-0000-4000-8000-000000000001';
    window.__uid=uid;window.__salesBrand=b;window.__requests=[];window.__fail=false;window.__dashboardTimeouts=1;window.__signOuts=0;
    const brands=[{id:a,name:'Safrich',slug:'safrich',active:true,distribution_mode:'agent'},{id:b,name:'Sales Brand',slug:'sales-brand',active:true,distribution_mode:'team_sales'}];
    const profile={id:uid,name:'Fixture Account',role,brand_id:role==='master'?null:b,email:'fixture@test.invalid',active:true,approval_status:'approved',eligible_project_ids:[]};
    const leads=[1,2,3].map(n=>({id:`sales-lead-${n}`,brand_id:b,name:`Sales Lead ${n} with a long readable name`,phone:'60120000000',email:'lead@test.invalid',project:'Sales Project',notes:'RM3500-RM5000\nNama Fixture\n+60 12-0000 000\nYa\nKerja Swasta\nlead@test.invalid\nSales Project',status:'new',queue_state:'sales_assigned',assigned_agent_id:uid,assignment_revision:1,status_revision:0,follow_up_count:0,received_at:new Date().toISOString(),created_at:new Date().toISOString()}));
    for(const lead of leads)lead.assignment_history=[{agentId:uid,assignedAt:lead.received_at}];
    const report=args=>({from:args.p_from,to:args.p_to,generated_at:new Date().toISOString(),rows:[{agent_id:uid,agent_name:'Fixture Account',assignments:3,total_contacted:1,total_follow_up:0,total_potential:0,total_cancelled_rejected:0,total_client:0,appointments:0,show_ups:0,due_now:0,within_five:1}],weeks:[{agent_id:uid,week_start:args.p_from,assignments:3,total_contacted:1,appointments:0,show_ups:0,within_five:1}]});
    window.__client=options=>({auth:{signOut:async()=>{window.__signOuts++},getSession:async()=>({data:{session:{user:{id:uid}}}}),getUser:async()=>({data:{user:{id:uid}}})},from:table=>{
      const f={};const q={select(){return q},eq(k,v){f[k]=v;return q},single:async()=>({data:table==='profiles'?profile:brands.find(x=>x.id===f.id)}),maybeSingle:async()=>({data:profile})};return q;
    },rpc:async(name,args={})=>{
      const stamp=await options.global.fetch('/sales-stamp');const brand=(await stamp.json()).brand||a;window.__requests.push({name,args,brand});
      if(name==='master_manage_brand')return {data:{ok:true,brands}};
      if(name==='admin_set_agent_get_lead_permission')return {data:{ok:true,get_lead_allowed:args.p_allowed}};
      if(name==='get_dashboard_state'){
        if(window.__dashboardTimeouts-->0)return {error:{code:'57014',message:'canceling statement due to statement timeout'}};
        return {data:{profiles:[profile],projects:[],leads:brand===b?leads:[],appointments:[],activities:[],events:[],server_now:new Date().toISOString()}};
      }
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
   await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#app-shell').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>window.__signOuts),0,'Transient dashboard timeout recovers without sign out');checks++;
   assert.equal(await page.evaluate(()=>window.__requests.filter(r=>r.name==='get_dashboard_state').length>=2),true,'Dashboard retries startup timeout');checks++;
   if(role==='master'){
    // The real UI intentionally rejects switching while startup requests run.
    await page.waitForFunction(()=>!globalLoadingCount&&!pendingBrandRequestCount&&!syncInProgress);
    await page.locator('#master-brand-switcher').selectOption('00000000-0000-4000-8000-000000000002');
   }
   await page.waitForFunction(()=>document.body.classList.contains('team-sales-brand'));
   await page.evaluate(()=>{switchView('follow-up-due');renderFollowUpDue();});
   assert.equal(await page.locator('#follow-up-limit-form').isVisible(),false,'Team Sales has no Agent due limit');checks++;
   await page.evaluate(()=>switchView('dashboard'));
   if(role!=='agent'){
    await page.locator('#team-performance-metrics .performance-metric').first().waitFor();
    assert.equal(await page.locator('#team-performance').isVisible(),true);checks++;
    assert.equal(await page.locator('#team-performance-metrics .performance-metric').count(),9);checks++;
    assert.equal(await page.locator('#team-performance-metrics strong').first().innerText(),'3');checks++;
    const lastReport=()=>page.evaluate(()=>window.__requests.filter(r=>r.name==='get_agent_performance_report').at(-1));
    assert.equal((Date.parse((await lastReport()).args.p_to)-Date.parse((await lastReport()).args.p_from))/86400000,6);checks++;
    await page.locator('[data-team-performance-days="1"]').click();
    await page.waitForFunction(()=>window.__requests.filter(r=>r.name==='get_agent_performance_report').at(-1).args.p_from===window.__requests.filter(r=>r.name==='get_agent_performance_report').at(-1).args.p_to);
    assert.equal(await page.locator('[data-team-performance-days="1"]').getAttribute('aria-pressed'),'true');checks++;
    await page.locator('[data-team-performance-days="7"]').click();
    await page.waitForFunction(()=>document.querySelector('#team-performance').getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('[data-team-performance-days="7"]').getAttribute('aria-pressed'),'true');checks++;
    if(name!=='desktop'){
     const size=await page.locator('#team-performance-metrics .performance-metric').first().boundingBox();
     assert.ok(size.height<110,`${name}: compact team metrics`);checks++;
    }
   }
   // This fixture bypasses only the existing PWA access modal, never production auth.
   if(role==='agent')await page.evaluate(()=>{getAgentAppAccessState=()=> 'ready';ensureAgentPushAccess=async()=>true;agentPushAccessReady=true;renderAgentAccessGate('ready');renderAll();});
   if(role==='agent'){
    await page.evaluate(()=>{activeBrand.distribution_mode='agent';getCurrentUser().followUpDueBlocked=true;getCurrentUser().getLeadAllowed=true;renderAll();switchView('dashboard');});
    await page.locator('#get-lead-button').click();
    assert.equal(await page.locator('#follow-up-block-modal').getAttribute('aria-hidden'),'false');checks++;
    await page.locator('#open-blocked-follow-up').click();
    assert.equal(await page.evaluate(()=>followUpSection),'due');checks++;
    assert.equal(await page.locator('#follow-up-due-view').isVisible(),true);checks++;
    await page.evaluate(()=>{activeBrand.distribution_mode='team_sales';getCurrentUser().followUpDueBlocked=false;renderAll();switchView('dashboard');});
    const order=()=>page.evaluate(()=>[...document.querySelector('#dashboard-view').children].filter(el=>el.matches('#own-performance,.new-lead-section,#dashboard-follow-up')).map(el=>el.id||'new-leads'));
    assert.deepEqual(await order(),['own-performance','new-leads','dashboard-follow-up']);checks++;
    assert.equal(await page.locator('#own-performance').isVisible(),true);checks++;
    assert.equal(await page.locator('#team-performance').isVisible(),false);checks++;
    if(name!=='desktop'){
     await page.locator('#own-performance-metrics .performance-metric').first().waitFor();
     const size=await page.locator('#own-performance-metrics .performance-metric').first().boundingBox();
     assert.ok(size.height<110,`${name}: compact personal metrics`);checks++;
    }
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
   assert.equal(await page.locator('.sales-lead-card .new-lead-notes').count(),3);checks++;
   assert.equal(await page.locator('.sales-lead-card .new-lead-notes').first().isVisible(),true);checks++;
   assert.match(await page.locator('.sales-lead-card .new-lead-notes').first().innerText(),/Kerja Swasta/);checks++;
   assert.doesNotMatch(await page.locator('.sales-lead-card').first().innerText(),/60120000000|12-0000 000|lead@test.invalid/);checks++;
   assert.match(await page.locator('.sales-lead-card .new-lead-notes').first().innerText(),/selepas Call atau WhatsApp/);checks++;
   assert.equal(await page.locator('#agent-lead-controls').isVisible(),false);checks++;
   assert.equal(await page.locator('#dashboard-view').innerText().then(t=>/CALL NOW|GET LEAD|STOP LEAD|≤5 min|5 minit|Sasaran 5m|Giliran agihan/.test(t)),false);checks++;
   await page.evaluate(()=>{playNotificationSound=async()=>{};return sendSystemNotification(state.leads[0],{force:true,toast:true});});
   assert.equal(await page.locator('#toast-message').innerText().then(t=>/CALL NOW|5 minit/.test(t)),false);checks++;
   assert.equal(await page.locator('#nav-lead-count').innerText(),'3');checks++;
   await page.evaluate(()=>switchView('follow-up-due'));
   assert.equal(await page.locator('[data-follow-up-section]').count(),3);checks++;
   assert.equal(await page.locator('#nav-follow-up-count').innerText(),'3');checks++;
   await page.evaluate(()=>{
    const button=document.querySelector('[data-follow-up-section="new"]');
    window.__feedbackStarted=false;
    window.__feedbackPromise=runButtonActionFeedback(button,()=>{window.__feedbackStarted=true;return new Promise(resolve=>{window.__finishFeedback=resolve;});});
   });
   assert.equal(await page.evaluate(()=>window.__feedbackStarted),true);checks++;
   assert.equal(await page.locator('[data-follow-up-section="new"]').getAttribute('aria-busy'),'true');checks++;
   assert.equal(await page.locator('[data-follow-up-section="new"] .action-feedback-spinner').count(),1);checks++;
   await page.locator('[data-follow-up-section="new"]').click();
   assert.equal(await page.locator('[data-follow-up-section="new"]').getAttribute('aria-pressed'),'false');checks++;
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.locator('.action-feedback-spinner').evaluate(el=>getComputedStyle(el).animationName),'none');checks++;
   await page.evaluate(()=>window.__finishFeedback());
   await page.waitForFunction(()=>!document.querySelector('.action-feedback-spinner'));
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.locator('[data-follow-up-section="new"]').click();
   assert.equal(await page.locator('#follow-up-due-list .follow-up-due-item').count(),3);checks++;
   assert.doesNotMatch(await page.locator('#follow-up-due-list').innerText(),/60120000000|12-0000 000|lead@test.invalid/);checks++;
   await page.evaluate(()=>{activeBrand.distribution_mode='agent';renderFollowUpDue();});
   assert.equal(await page.locator('[data-follow-up-section]').count(),3);checks++;
   assert.equal(await page.locator('#follow-up-due-list [data-sales-contact]').count(),0);checks++;
   assert.doesNotMatch(await page.locator('#follow-up-due-list').innerText(),/60120000000|12-0000 000|lead@test.invalid/);checks++;
   await page.evaluate(()=>{activeBrand.distribution_mode='team_sales';renderFollowUpDue();});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}: follow-up no overflow`);checks++;
   await page.screenshot({path:path.join(artifacts,`${name}-${role}-follow-up-new.png`),fullPage:true,animations:'disabled'});
   await page.locator('[data-follow-up-section="contacted"]').click();
   assert.equal(await page.locator('#follow-up-due-list .follow-up-due-item').count(),0);checks++;
   await page.evaluate(()=>{state.leads[0].status='contacted';state.followUpDue=[{...state.leads[0],followUpActivityAt:state.leads[0].createdAt}];renderFollowUpDue();});
   assert.equal(await page.locator('#follow-up-due-list .follow-up-due-item').count(),1);checks++;
   assert.equal(await page.locator('#nav-follow-up-count').innerText(),'3');checks++;
   await page.locator('[data-follow-up-section="due"]').click();
   assert.equal(await page.locator('#follow-up-due-list .follow-up-due-item').count(),1);checks++;
   await page.evaluate(()=>{state.leads[0].status='new';state.followUpDue=[];renderFollowUpDue();});
   await page.evaluate(()=>switchView('dashboard'));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}: no overflow`);checks++;
   if(role!=='agent'){
    assert.equal(await page.locator('.sales-lead-card .sales-lead-actions').count(),0);checks++;
    await page.screenshot({path:path.join(artifacts,`${name}-${role}-team-performance.png`),fullPage:true});
    await page.evaluate(()=>switchView('leads'));
    assert.equal(await page.locator('.lead-log-summary [data-sales-contact="call"]').count(),3);checks++;
   }
   const contactRoot=role==='agent'?'.sales-lead-card':'.lead-log-summary';
   const call=page.locator(`${contactRoot} [data-sales-contact="call"][data-sales-lead="sales-lead-1"]`);
   assert.match(await call.getAttribute('href'),/^tel:/);checks++;
   // Preserve actual button handlers but suppress external phone navigation in QA.
   await call.evaluate(el=>el.href='javascript:void(0)');await call.click();
   await page.waitForFunction(()=>window.__requests.some(r=>r.name==='team_sales_contact'));
   await page.waitForFunction(()=>state.leads.find(l=>l.id==='sales-lead-1')?.status==='contacted');
   // The mocked transport has no real Realtime subscription; repaint the
   // confirmed snapshot as the production broadcast catch-up normally does.
   await page.evaluate(()=>renderAll());
   await page.waitForFunction(()=>document.querySelectorAll('.sales-lead-card').length===2);
   assert.equal(await page.evaluate(()=>window.__requests.find(r=>r.name==='team_sales_contact').args.p_channel),'call');checks++;
   const wa=page.locator(`${contactRoot} [data-sales-contact="whatsapp"][data-sales-lead="sales-lead-2"]`);
   assert.match(await wa.getAttribute('href'),/wa.me/);checks++;
   await page.evaluate(()=>window.__fail=true);await wa.evaluate(el=>el.href='javascript:void(0)');await wa.click();
   await page.waitForFunction(()=>document.querySelector('.sales-contact-state')?.textContent.includes('Belum disahkan'));
   assert.equal(await page.locator('.sales-lead-card').count(),2,'Pending action is not falsely marked Contacted');checks++;
   await page.waitForTimeout(250);await page.evaluate(()=>{window.__fail=false;return flushContactOutbox();});
   await page.waitForFunction(()=>document.querySelectorAll('.sales-lead-card').length===1);
   assert.equal(await page.evaluate(()=>state.leads.every(l=>l.followUpCount===0)),true,'Ordinary WA does not increment Follow Up');checks++;
   await page.evaluate(()=>{
    state.leads.forEach((lead,index)=>{lead.assignmentHistory=[{agentId:lead.assignedAgentId,assignedAt:new Date(Date.now()-(index===1?8:0)*86400000).toISOString()}];});
    renderAll();
   });
   await page.evaluate(()=>switchView('dashboard'));
   const metricsRoot=role==='agent'?'#own-performance-metrics':'#team-performance-metrics';
   const metricLabels=await page.locator(`${metricsRoot} .performance-metric > small`).allTextContents();
   assert.equal(metricLabels[1],'New');checks++;
   assert.equal(metricLabels.includes('Show Up'),false);checks++;
   assert.equal(await page.locator(`${metricsRoot} [data-sales-performance="new"] strong`).innerText(),'1');checks++;
   await page.locator(`${metricsRoot} [data-sales-performance="new"]`).click();
   assert.equal(await page.locator('#lead-filter').inputValue(),'new');checks++;
   assert.equal(await page.locator('#lead-log-count').innerText(),'1 lead');checks++;
   await page.locator('[data-sales-filter-reset]').click();
   await page.evaluate(()=>switchView('dashboard'));
   await page.locator(`${metricsRoot} [data-sales-performance="contacted"]`).click();
   assert.equal(await page.locator('#lead-filter').inputValue(),'contacted');checks++;
   assert.equal(await page.locator('#lead-log-count').innerText(),'1 lead','Card uses assignment date and current ownership');checks++;
   assert.equal(await page.locator('#sales-drilldown-notice').isVisible(),true);checks++;
   await page.locator('[data-sales-filter-reset]').click();
   assert.equal(await page.locator('#lead-log-count').innerText(),'3 lead');checks++;
   for(const status of ['group_follow_up','potential','group_cancelled_rejected','client']){
    await page.evaluate(()=>switchView('dashboard'));
    await page.locator(`${metricsRoot} [data-sales-performance="${status}"]`).click();
    assert.equal(await page.locator('#lead-filter').inputValue(),status);checks++;
    await page.locator('[data-sales-filter-reset]').click();
   }
   await page.evaluate(()=>switchView('dashboard'));
   await page.locator(`${metricsRoot} [data-sales-performance="due"]`).click();
   assert.equal(await page.locator('#follow-up-due-view').isVisible(),true);checks++;
   await page.evaluate(()=>switchView('dashboard'));
   await page.locator(`${metricsRoot} [data-sales-performance="contacted"]`).click();
   await page.evaluate(()=>openNotificationLead('sales-lead-2'));
   assert.equal(await page.locator('#lead-log-count').innerText(),'1 lead','Push clears an older assignment-date drilldown');checks++;
   assert.equal(await page.locator('#sales-drilldown-notice').isVisible(),false);checks++;
   await page.evaluate(()=>{elements.leadSearch.value='';renderLeadsTable();});
   await page.evaluate(()=>switchView('dashboard'));
   await page.screenshot({path:path.join(artifacts,`${name}-${role}-dashboard.png`),fullPage:true});
   await page.evaluate(()=>switchView('leads'));
   assert.equal(await page.locator('.lead-log-summary .new-lead-notes').count(),3);checks++;
   assert.equal(await page.locator('.lead-log-summary .new-lead-notes').first().isVisible(),true);checks++;
   assert.match(await page.locator('.lead-log-summary .new-lead-notes').first().innerText(),/Kerja Swasta/);checks++;
   const newRow=page.locator('.lead-log-summary').filter({has:page.locator('[data-sales-contact="whatsapp"]')});
   assert.doesNotMatch(await newRow.locator('.new-lead-notes').innerText(),/60120000000|12-0000 000|lead@test.invalid/);checks++;
   const detail=page.locator('#lead-log-detail-sales-lead-3');
   assert.doesNotMatch(await detail.locator('.lead-note-field').inputValue(),/60120000000|12-0000 000|lead@test.invalid/);checks++;
   assert.equal(await detail.locator('.lead-note-field').isDisabled(),true);checks++;
   assert.match(await page.locator('#lead-log-detail-sales-lead-1 .lead-note-field').inputValue(),/12-0000 000/);checks++;
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
   assert.equal(await page.locator('#leads-view [data-sales-contact="whatsapp"]').count(),1);checks++;
   assert.equal(await page.locator('#leads-view [data-lead-follow-up]').count(),2);checks++;
   for (const action of await page.locator('#leads-view .lead-message-action').all()) {
    assert.equal(await action.locator('[data-sales-contact="whatsapp"], [data-lead-follow-up]').count(),1,'One WhatsApp or Follow Up per card');checks++;
   }
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
    assert.equal(await page.locator('#team-performance').isVisible(),false,'Safrich has no Team report panel');checks++;
    assert.equal(await page.locator('.sales-lead-card').count(),0,'Brand switching clears Sales cards');checks++;
    await page.evaluate(()=>{switchView('follow-up-due');renderFollowUpDue();});
    assert.equal(await page.locator('#follow-up-limit-form').isVisible(),true);checks++;
    assert.equal(await page.locator('#follow-up-limit-input').inputValue(),'50');checks++;
    assert.equal(await page.locator('#projects-view h2').innerText(),'Projek','Safrich retains original terminology');checks++;
    await page.evaluate(()=>{
      window.__reloadOriginal=queueRemoteReload;queueRemoteReload=()=>{};
      state.agents.push({id:'permission-fixture',name:'Permission Agent',role:'agent',active:true,approvalStatus:'approved',getLeadAllowed:true,leadReady:true,phone:'',email:'',eligibleProjectIds:[]});
      switchView('agents');renderAgents();
    });
    const permissionSwitch=page.locator('[data-agent-get-lead-permission="permission-fixture"]');
    assert.equal(await permissionSwitch.getAttribute('aria-checked'),'true');checks++;
    await permissionSwitch.click();
    await page.waitForFunction(()=>document.querySelector('[data-agent-get-lead-permission="permission-fixture"]')?.getAttribute('aria-checked')==='false');
    assert.equal(await page.evaluate(()=>getAgent('permission-fixture').active),true);checks++;
    assert.equal(await page.evaluate(()=>getAgent('permission-fixture').leadReady),false);checks++;
    await permissionSwitch.click();
    await page.waitForFunction(()=>document.querySelector('[data-agent-get-lead-permission="permission-fixture"]')?.getAttribute('aria-checked')==='true');
    assert.equal(await page.evaluate(()=>getAgent('permission-fixture').leadReady),false);checks++;
    await page.evaluate(()=>{queueRemoteReload=window.__reloadOriginal;});
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
