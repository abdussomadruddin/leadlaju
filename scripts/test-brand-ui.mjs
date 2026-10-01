// UI integration test with mocked transport. Database authorization is tested
// separately by test-brand-database.mjs, not claimed by this mock.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const { chromium,devices }=require(process.env.LEADLAJU_PLAYWRIGHT_MODULE || '/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.env.LEADLAJU_TEST_URL || 'http://127.0.0.1:8769';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'leadlaju-brand-ui-'));
const browser=await chromium.launch({channel:'chrome',headless:true});
let checks=0;
try {
 for(const [name,device,testRole='master'] of [['desktop',{viewport:{width:1366,height:900}}],['short-desktop',{viewport:{width:1366,height:640}}],['tablet-desktop',{viewport:{width:1024,height:600}}],['iphone',devices['iPhone 13']],['android',devices['Pixel 7']],['small-phone',{viewport:{width:320,height:568},isMobile:true,hasTouch:true}],['landscape-phone',{viewport:{width:740,height:360},isMobile:true,hasTouch:true}],['admin',{viewport:{width:1366,height:900}},'admin'],['agent',devices['iPhone 13'],'agent']]) {
  const mobile=(device.viewport?.width || 390)<=850;
  const context=await browser.newContext({...device,reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/runtime-config',r=>r.fulfill({json:{backend:'supabase',supabaseUrl:origin,supabasePublishableKey:'test-only'}}));
  await page.route('https://esm.sh/@supabase/supabase-js@2.116.0',r=>r.fulfill({contentType:'application/javascript',body:'export const createClient=(url,key,options)=>window.__createBrandTestClient(options);'}));
  await page.addInitScript(({testRole})=>{
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.__copiedLink=value;}}});
    const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',user='10000000-0000-4000-8000-000000000001';
    window.__brands=[{id:a,name:'Safrich',slug:'safrich',active:true},{id:b,name:'Brand B',slug:'brand-b',active:true}];
    window.__admins=[{id:'test-existing-admin',name:'Admin Safrich',email:'admin@example.test',brand_id:a,active:true}];window.__brandRequests=[];
    const profile={id:user,name:testRole==='master'?'Abdus Somad Ruddin — Master':testRole,role:testRole,brand_id:testRole==='master'?null:a,email:'fixture@example.test',active:true,approval_status:'approved'};
    window.__createBrandTestClient=options=>{
      const rpc=async(name,args={})=>{
        const headers=new Headers();const stamp=await options.global.fetch('/brand-test-stamp',{headers});const brand=(await stamp.json()).brand || a;
        window.__brandRequests.push({name,brand});
        if(name==='get_dashboard_state'&&window.__monitorReadFails)return {error:{message:'Simulated canonical read failure'}};
        if(name==='master_manage_brand'){
          if(args.p_action==='create')window.__brands.push({id:'00000000-0000-4000-8000-000000000003',...args.p_brand,active:true});
          if(args.p_action==='set_active')window.__brands.find(x=>x.id===args.p_brand.id).active=args.p_brand.active;
          return {data:{ok:true,brands:window.__brands},error:null};
        }
        if(name==='get_dashboard_state')return {data:{profiles:[profile],projects:[],activities:[],events:[],appointments:[],server_now:new Date().toISOString(),leads:[{id:brand==='00000000-0000-4000-8000-000000000001'?'lead-a':'lead-b',brand_id:brand,name:brand===a?'Safrich Lead':'Brand B Lead',phone:'60120000000',project:brand===a?'Safrich Project':'Brand B Project',source:'Manual Lead',status:'potential',queue_state:'potential',created_at:new Date().toISOString(),assigned_agent_id:'agent'}]},error:null};
        if(name==='get_bulletin_feed')return {data:{bulletins:[],unread_count:0},error:null};
        if(name==='get_follow_up_due')return {data:{leads:[],server_now:new Date().toISOString()},error:null};
        if(name==='get_agent_performance_report')return {data:{rows:[],weeks:[],from:args.p_from,to:args.p_to},error:null};
        return {data:{ok:true},error:null};
      };
      return {rpc,from:table=>{
        const filters={};const query={select(){return query},eq(k,v){filters[k]=v;return query},single:async()=>({data:table==='profiles'?profile:window.__brands.find(x=>x.id===filters.id),error:null}),maybeSingle:async()=>({data:profile,error:null})};return query;
      },auth:{getSession:async()=>({data:{session:{user:{id:user}}}}),getUser:async()=>({data:{user:{id:user}}}),signOut:async()=>({}),updateUser:async()=>({data:{user:{id:user}}})},functions:{invoke:async(name,{body})=>{
        if(name==='master-manage-account'){if(body.action==='create_admin')window.__admins.push({id:'test-admin',...body,brand_id:body.brand_id,active:true});return {data:{ok:true,admins:window.__admins},error:null};}
        return {data:{ok:true,integrations:[],projects:[],brand:window.__brands[0]},error:null};
      }},realtime:{setAuth:async()=>{}},channel:()=>{const c={on(){return c},subscribe(){return c}};return c;},removeChannel:async()=>{}};
    };
  },{testRole});
  await page.route('**/brand-test-stamp',r=>r.fulfill({json:{brand:r.request().headers()['x-leadlaju-brand']}}));
  await page.goto(origin);
  if(testRole!=='master') {
    await page.locator('#app-shell').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('#active-brand-label').textContent==='Safrich');
    assert.equal(await page.locator('[data-view="brands"]').isVisible(),false);checks++;
    assert.equal(await page.locator('#master-brand-switcher').isVisible(),false);checks++;
    assert.equal(await page.evaluate(()=>window.__brandRequests.some(r=>r.name==='master_manage_brand')),false);checks++;
    if(testRole==='admin') {
      await page.locator('.nav-item[data-view="agents"]').click();
      await page.locator('#copy-agent-registration-link').click();
      assert.equal(await page.evaluate(()=>window.__copiedLink),`${origin}/daftar/safrich`);checks++;
    } else { assert.equal(await page.locator('#copy-agent-registration-link').isVisible(),false);checks++; }
    assert.deepEqual(errors,[],`${name}: no runtime errors`);checks++;
    await context.close();continue;
  }
  await page.waitForFunction(()=>document.querySelector('#master-brand-list')?.children.length===2);
  await page.locator('#lifecycle-sync-overlay[aria-hidden="true"]').waitFor({state:'attached'});
  if(mobile) await page.locator('#mobile-more-tab').click();
  const sidebarLayout=await page.evaluate(()=>{
    const footer=document.querySelector('.sidebar-account').getBoundingClientRect(),nav=document.querySelector('.main-nav').getBoundingClientRect();
    return {accountVisible:footer.top>=0&&footer.bottom<=innerHeight,notOverlapped:nav.bottom<=footer.top,scrollable:getComputedStyle(document.querySelector('.main-nav')).overflowY==='auto'};
  });
  assert.equal(sidebarLayout.accountVisible,true,`${name}: account remains inside viewport`);checks++;
  assert.equal(sidebarLayout.notOverlapped,true,`${name}: navigation never overlaps account`);checks++;
  assert.equal(sidebarLayout.scrollable,true);checks++;
  await page.locator('.main-nav [data-view="integrations"]').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.querySelector('.sidebar-account').getBoundingClientRect().bottom<=innerHeight),true,`${name}: scrolling menu keeps account anchored`);checks++;
  await page.locator('#sidebar-settings').click();
  assert.equal(await page.locator('#account-menu').isVisible(),true);checks++;
  await page.locator('#sidebar-settings').click();
  await page.screenshot({path:path.join(artifacts,`${name}-sidebar.png`)});
  if(mobile) await page.locator('#mobile-sidebar-close').click();
  assert.equal(await page.locator('#active-brand-label').innerText(),'Safrich');checks++;
  assert.equal(await page.locator('#master-brand-switcher').isVisible(),true);checks++;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}: no horizontal overflow`);checks++;
  await page.screenshot({path:path.join(artifacts,`${name}-master.png`),fullPage:true});
  await page.locator('#master-brand-switcher').selectOption('00000000-0000-4000-8000-000000000002');
  await page.waitForFunction(()=>document.querySelector('#active-brand-label')?.textContent==='Brand B'&&document.querySelector('#dashboard-view')?.classList.contains('active'));
  await page.locator(!mobile?'.nav-item[data-view="leads"]':'.mobile-tab[data-view="leads"]').click();
  await page.waitForFunction(()=>document.querySelector('#leads-view')?.innerText.includes('Brand B Lead'));
  assert.equal(await page.locator('#leads-view').innerText().then(t=>t.includes('Safrich Lead')),false,'No cached rows from previous brand');checks++;
  if(mobile) await page.locator('#mobile-more-tab').click();
  await page.locator('.nav-item[data-view="agents"]').click();
  await page.locator('#copy-agent-registration-link').click();
  assert.equal(await page.evaluate(()=>window.__copiedLink),`${origin}/daftar/brand-b`,'Copy uses the selected brand, not old Safrich context');checks++;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}: agent management actions fit viewport`);checks++;
  if(mobile) await page.locator('#mobile-more-tab').click();
  await page.locator('[data-view="brands"]:visible').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}: brand workspace has no horizontal overflow`);checks++;
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.master-create-grid')).alignItems),'start');checks++;
  if(mobile) {
    assert.equal(await page.evaluate(()=>document.querySelector('#brands-view .master-page-heading').getBoundingClientRect().top>=document.querySelector('.topbar').getBoundingClientRect().bottom-1),true,`${name}: content clears fixed header`);checks++;
  }
  await page.screenshot({path:path.join(artifacts,`${name}-brands.png`),fullPage:mobile});
  if(mobile) await page.screenshot({path:path.join(artifacts,`${name}-brands-viewport.png`)});
  await page.locator('#master-admin-list summary').first().click();
  assert.equal(await page.locator('#master-admin-list [name="name"]').first().isVisible(),true);checks++;
  await page.locator('#master-admin-list summary').first().click();
  await page.locator('#master-brand-list article').filter({has:page.locator('[data-master-toggle="00000000-0000-4000-8000-000000000002"]')}).locator('summary').click();
  await page.locator('[data-master-toggle="00000000-0000-4000-8000-000000000002"]').click();
  await page.locator('#brand-confirm-next').click();
  assert.equal(await page.locator('#brand-confirm-message').innerText().then(t=>t.includes('Pengesahan terakhir')),true);checks++;
  await page.locator('#brand-confirm-cancel').click();
  assert.equal(await page.evaluate(()=>window.__brands[1].active),true,'Cancel leaves brand active');checks++;
  if(name==='desktop'){
   await page.locator('#master-brand-form [name=name]').fill('Brand C');await page.locator('#master-brand-form [name=slug]').fill('brand-c');await page.locator('#master-brand-form [name=distribution_mode]').selectOption('team_sales');await page.locator('#master-brand-form button').click();
   await page.waitForFunction(()=>document.querySelector('#master-brand-list').children.length===3);
   assert.equal(await page.evaluate(()=>window.__brands[2].distribution_mode),'team_sales');checks++;
   await page.locator('#master-admin-form [name=name]').fill('Admin C');await page.locator('#master-admin-form [name=email]').fill('admin-c@example.test');await page.locator('#master-admin-form button').click();
   await page.waitForFunction(()=>document.querySelector('#master-admin-list').innerText.includes('Admin C'));checks++;
  }
  if(['desktop','iphone','android','small-phone'].includes(name)){
    await page.evaluate(()=>switchView('lead-monitor'));
    assert.notEqual(await page.locator('#monitor-health').innerText(),'Tidak disahkan');checks++;
    // Let the actual dashboard timer mark an old canonical read unverified.
    await page.evaluate(()=>{monitorLastCanonicalSyncAt=Date.now()-90001;});
    await page.waitForFunction(()=>document.querySelector('#monitor-health').textContent==='Tidak disahkan');
    assert.equal(await page.locator('#monitor-critical-count').innerText(),'-');checks++;
    await page.evaluate(()=>window.__monitorReadFails=true);
    await page.locator('#monitor-refresh-button').click();
    await page.waitForFunction(()=>!document.querySelector('#monitor-refresh-button').disabled);
    assert.equal(await page.locator('#monitor-health').innerText(),'Tidak disahkan');checks++;
    assert.match(await page.locator('#monitor-list').innerText(),/Semakan Supabase gagal/);checks++;
    await page.evaluate(()=>window.__monitorReadFails=false);
    await page.locator('#monitor-refresh-button').click();
    await page.waitForFunction(()=>!document.querySelector('#monitor-refresh-button').disabled);
    assert.notEqual(await page.locator('#monitor-health').innerText(),'Tidak disahkan');checks++;
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks++;
    await page.screenshot({path:path.join(artifacts,`${name}-monitor.png`)});
  }
  assert.deepEqual(errors,[],`${name}: no runtime errors`);checks++;
  await context.close();
 }
 console.log(`PASS: ${checks} UI assertions. Mocked server transport; desktop, iPhone, Android and 320px. Screenshots: ${artifacts}`);
} finally {await browser.close();}
