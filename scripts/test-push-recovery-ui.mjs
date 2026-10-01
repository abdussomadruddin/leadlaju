// Real browser + actual mandatory gate; browser Push API and Supabase are mocked.
// Does not send push or claim physical iOS/Android delivery verification.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,devices}=require(process.env.LEADLAJU_PLAYWRIGHT_MODULE||'/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.env.LEADLAJU_TEST_URL||'http://127.0.0.1:8769';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'leadlaju-push-ui-'));
const browser=await chromium.launch({channel:'chrome',headless:true});let checks=0;
try {
 for(const [deviceName,device] of [['iphone',devices['iPhone 13']],['android',devices['Pixel 7']],['small-phone',{...devices['iPhone 13'],viewport:{width:320,height:568}}],['desktop',{viewport:{width:1366,height:900}}]]){
  for(const scenario of deviceName==='desktop'?['admin']:['collision','network','permission','safrich']){
   console.log(`Checking ${deviceName}: ${scenario}`);
   const context=await browser.newContext({...device,serviceWorkers:'block'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/runtime-config',r=>r.fulfill({json:{backend:'supabase',supabaseUrl:origin,supabasePublishableKey:'fixture'}}));
   await page.route('https://esm.sh/@supabase/supabase-js@2.116.0',r=>r.fulfill({contentType:'application/javascript',body:'export const createClient=()=>window.__client;'}));
   await page.addInitScript(({scenario})=>{
    window.__push={unsubscribed:0,subscribed:0,requests:[],fail:scenario==='network'};
    const uid='10000000-0000-4000-8000-000000000001',bid='00000000-0000-4000-8000-000000000001';
    const profile={id:uid,name:'Fixture',email:'fixture@test.invalid',active:true,role:scenario==='admin'?'admin':'agent',brand_id:bid,approval_status:'approved'};
    const brand={id:bid,name:scenario==='safrich'?'Safrich':'Team Sales Brand',slug:'fixture',active:true,distribution_mode:scenario==='safrich'?'agent':'team_sales'};
    const original=window.matchMedia.bind(window);window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true,addEventListener(){},removeEventListener(){}}:original(q);
    class Notification {static permission=scenario==='permission'?'default':'granted';static requestPermission=async()=>{Notification.permission='granted';return 'granted';};}
    window.Notification=Notification;window.PushManager=class {};
    // An iOS audio-unlock promise must never hold notification registration open.
    window.AudioContext=class {state='suspended';resume(){return new Promise(()=>{});}};
    let currentEndpoint='https://fixture.invalid/old';
    const subscription=()=>({endpoint:currentEndpoint,toJSON:()=>({endpoint:currentEndpoint,keys:{p256dh:'test-key',auth:'test-auth'}}),unsubscribe:async()=>{window.__push.unsubscribed++;return true;}});
    const registration={update:async()=>{},pushManager:{getSubscription:async()=>subscription(),subscribe:async()=>{window.__push.subscribed++;currentEndpoint='https://fixture.invalid/new';return subscription();}},showNotification:async()=>{}};
    Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>registration,ready:Promise.resolve(registration),addEventListener(){},controller:null}});
    window.__client={auth:{getSession:async()=>({data:{session:{user:{id:uid}}}}),getUser:async()=>({data:{user:{id:uid}}})},from:table=>{const q={select(){return q},eq(){return q},single:async()=>({data:table==='profiles'?profile:brand}),maybeSingle:async()=>({data:profile})};return q;},rpc:async(name,args={})=>{
      if(name==='register_push_subscription'){
        window.__push.requests.push(args);await new Promise(r=>setTimeout(r,120));
        if(window.__push.fail)return {error:{code:'FETCH',message:'Simulated network outage'}};
        if(scenario==='collision'&&args.p_endpoint.endsWith('/old'))return {error:{code:'42501',message:'new row violates row-level security policy (USING expression) for table "push_subscriptions"'}};
        return {data:{ok:true,notification_ready:true}};
      }
      if(name==='get_dashboard_state')return {data:{profiles:[profile],projects:[],leads:[],appointments:[],events:[],activities:[],server_now:new Date().toISOString()}};
      if(name==='get_bulletin_feed')return {data:{bulletins:[],unread_count:0}};
      if(name==='get_follow_up_due')return {data:{leads:[]}};
      if(name==='get_agent_performance_report')return {data:{rows:[],weeks:[],from:args.p_from,to:args.p_to,generated_at:new Date().toISOString()}};
      return {data:{ok:true}};
    },functions:{invoke:async()=>({data:{ok:true}})},channel:()=>{const c={on(){return c},subscribe(){return c}};return c;},removeChannel:async()=>{},realtime:{setAuth:async()=>{}}};
   },{scenario});
   await page.goto(origin);await page.locator('#app-shell').waitFor({state:'visible'});
   const gate=page.locator('#notification-required-modal');const button=page.locator('#enable-required-notifications');
   if(scenario==='collision'||scenario==='network'||scenario==='permission'){
    await gate.waitFor({state:'visible'});
    assert.equal(await page.locator('.notification-required-icon svg').evaluate(el=>getComputedStyle(el).fill),'none');checks++;
    if(scenario!=='permission')await page.waitForFunction(()=>!agentPushAccessCheckInProgress&&window.__push.requests.length>0);
    assert.equal(await page.evaluate(()=>getAgentAppAccessState()==='ready'),false);checks++;
    await button.click();await page.waitForFunction(()=>notificationRequestInProgress);
    assert.equal(await button.isDisabled(),true);checks++;
    assert.match(await button.innerText(),/Menyambungkan/);checks++;
    await page.waitForFunction(()=>!notificationRequestInProgress);
    if(scenario==='network'){
      assert.equal(await gate.isVisible(),true);checks++;
      assert.equal(await page.locator('#notification-connection-error').isVisible(),true);checks++;
      assert.equal(await page.evaluate(()=>window.__push.unsubscribed),0);checks++;
      assert.equal(await button.isEnabled(),true);checks++;
      await page.screenshot({path:path.join(artifacts,`${deviceName}-failure.png`)});
      await page.evaluate(()=>window.__push.fail=false);await button.click();
    }
    await gate.waitFor({state:'hidden'});
   }else if(scenario==='safrich')await gate.waitFor({state:'hidden'});
   else {await page.evaluate(()=>requestNotifications());assert.equal(await gate.isVisible(),false);checks++;}
   assert.equal(await page.evaluate(()=>document.body.classList.contains('agent-access-locked')),false);checks++;
   if(scenario==='safrich'){assert.equal(await page.locator('#sidebar-user-role').innerText(),'Agent');checks++;}
   assert.equal(await page.evaluate(()=>window.__push.unsubscribed),scenario==='collision'?1:0);checks++;
   assert.equal(await page.evaluate(()=>window.__push.subscribed),scenario==='collision'?1:0);checks++;
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks++;
   assert.deepEqual(errors,[]);checks++;
   await page.screenshot({path:path.join(artifacts,`${deviceName}-${scenario}.png`)});await context.close();
  }
 }
 console.log(`PASS: ${checks} push reconnect/gate browser assertions; mocked Push API and RPC. Artifacts: ${artifacts}`);
}finally{await browser.close();}
