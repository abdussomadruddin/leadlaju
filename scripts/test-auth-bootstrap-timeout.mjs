import {createRequire} from 'node:module';import fs from 'node:fs';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium,devices}=require('/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});let checks=0;
const app=fs.readFileSync('app.js','utf8').replace('const REMOTE_REQUEST_TIMEOUT_MS = 12000;','const REMOTE_REQUEST_TIMEOUT_MS = 100;');
try{for(const [name,device] of [['desktop',{viewport:{width:1366,height:900}}],['iphone',devices['iPhone 13']],['android',devices['Pixel 7']]]){
 const context=await browser.newContext({...device,serviceWorkers:'block'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app.js?*',r=>r.fulfill({contentType:'application/javascript',body:app}));
 await page.route('**/api/runtime-config',r=>r.fulfill({json:{backend:'supabase',supabaseUrl:'http://127.0.0.1:8769',supabasePublishableKey:'fixture'}}));
 await page.route('https://esm.sh/@supabase/supabase-js@2.116.0',r=>r.fulfill({contentType:'application/javascript',body:'export const createClient=()=>window.__client;'}));
 await page.addInitScript(()=>{
  const profile={id:'user',brand_id:'brand',name:'Admin Fixture',email:'fixture@example.invalid',role:'admin',active:true,approval_status:'approved'};
  window.__sessionReads=0;window.__signOuts=0;
  window.__client={auth:{getSession:async()=>{window.__sessionReads++;if(window.__sessionReads===1)await new Promise(r=>setTimeout(r,650));return {data:{session:{user:{id:'user'},access_token:'fixture-token'}}};},getUser:async()=>({data:{user:{id:'user'}}}),signOut:async()=>{window.__signOuts++;return {};},signInWithPassword:async()=>({data:{user:null},error:{name:'AuthRetryableFetchError',status:503,message:'signal is aborted without reason'}}),onAuthStateChange(){}},rpc:async name=>({data:name==='get_dashboard_state'?{profiles:[profile],projects:[],leads:[],appointments:[],events:[]}:{leads:[],bulletins:[],rows:[],weeks:[]}}),from:table=>{const q={select(){return q},eq(){return q},single:async()=>({data:table==='profiles'?profile:{id:'brand',name:'Safrich',active:true,distribution_mode:'agent'}})};return q;},realtime:{setAuth:async()=>{}},channel:()=>{const c={on(){return c},subscribe(){return c}};return c;},removeChannel:async()=>{}};
 });
 await page.goto('http://127.0.0.1:8769/');
 await page.locator('#startup-message').getByText('Sambungan pengesahan mengambil masa.',{exact:false}).waitFor();checks++;
 assert.equal(await page.locator('#login-screen').isVisible(),false);checks++;
 await page.waitForFunction(()=>document.body.classList.contains('authenticated')&&!document.getElementById('startup-recovery'));
 assert.ok(await page.evaluate(()=>window.__sessionReads>=2 && window.__sessionReads<=5));assert.equal(await page.evaluate(()=>window.__signOuts),0);checks+=2;
 await page.evaluate(()=>{showLogin();hideLifecycleSyncOverlay();});
 await page.locator('#login-email').fill('fixture@example.invalid');await page.locator('#login-password').fill('fixture-password');
 await page.locator('#login-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#login-error').textContent.includes('terganggu sementara'));
 assert(!await page.locator('#login-error').innerText().then(t=>t.includes('kata laluan tidak betul')));checks++;
 await page.evaluate(()=>{window.__client.auth.signInWithPassword=async()=>({data:{user:null},error:{code:'invalid_credentials',status:400}});});
 await page.locator('#login-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#login-error').textContent==='Emel atau kata laluan tidak betul.');checks++;
 await page.screenshot({path:`/tmp/leadlaju-bootstrap-fixed-${name}.png`});assert.deepEqual(errors,[]);checks++;
 await context.close();
}console.log(`PASS: ${checks} auth bootstrap timeout browser assertions desktop/iPhone/Android`);}finally{await browser.close();}
