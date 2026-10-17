import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
let checks=0;
try {
 for(const [name,device] of [['desktop',{viewport:{width:1366,height:900}}],['iphone',devices['iPhone 13']],['android',devices['Pixel 7']]]) {
  const context=await browser.newContext({...device,serviceWorkers:'block'});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:8769/?demo=1');
  await page.waitForFunction(()=>typeof retryDashboardStartup==='function');
  await page.waitForFunction(()=>document.body.classList.contains('logged-out'));
  await page.evaluate(()=>{
   window.__signOutScopes=[];window.__syncs=0;
   beginColdStartSync=async()=>{window.__syncs++;hideLifecycleSyncOverlay();return true;};
   remoteDatabaseClient={auth:{getUser:async()=>({data:{user:{id:'fixture-user'}}}),signOut:async options=>{window.__signOutScopes.push(options.scope);return {};}}};
   state.currentUserId='fixture-user';
   document.body.classList.remove('logged-out','auth-pending');document.body.classList.add('authenticated');
   showLifecycleSyncOverlay('cinematic');document.querySelector('#retry-dashboard-startup').hidden=false;
  });
  await page.locator('#retry-dashboard-startup').click();
  await page.waitForFunction(()=>window.__syncs===1);
  assert.equal(await page.evaluate(()=>window.__signOutScopes.length),0);checks++;
  await page.evaluate(()=>{
   remoteDatabaseClient.auth.getUser=async()=>{throw new Error('Failed to fetch');};
   showLifecycleSyncOverlay('cinematic');document.querySelector('#retry-dashboard-startup').hidden=false;
  });
  await page.locator('#retry-dashboard-startup').click();
  await page.locator('#lifecycle-sync-overlay').getByText('Sambungan belum tersedia. Sesi dikekalkan; cuba semula.').waitFor();
  assert.equal(await page.evaluate(()=>window.__signOutScopes.length),0);checks++;
  assert.equal(await page.locator('#retry-dashboard-startup').isEnabled(),true);checks++;
  await page.evaluate(()=>{
   remoteDatabaseClient.auth.getUser=async()=>({error:{status:401}});
   remoteDatabaseClient.auth.refreshSession=async()=>({error:{code:'refresh_token_not_found',status:400}});
  });
  await page.locator('#retry-dashboard-startup').click();
  await page.waitForFunction(()=>document.body.classList.contains('logged-out')&&!document.querySelector('#lifecycle-sync-overlay').classList.contains('visible'));
  assert.equal(await page.locator('#login-error').innerText(),'Sesi telah tamat. Log masuk semula menggunakan kata laluan terkini.');checks++;
  assert.deepEqual(await page.evaluate(()=>window.__signOutScopes),['local']);checks++;
  assert.equal(await page.evaluate(()=>state.currentUserId),null);checks++;
  await page.screenshot({path:`/tmp/leadlaju-auth-recovery-${name}.png`});
  await context.close();
 }
 console.log(`PASS: ${checks} startup recovery browser assertions desktop/iPhone/Android`);
} finally {await browser.close();}
