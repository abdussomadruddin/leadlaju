// Local browser fixtures only; no production sessions or business writes.
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
  await page.waitForFunction(()=>typeof queueRemoteReload==='function' && document.body.classList.contains('logged-out'));
  const result=await page.evaluate(async()=>{
   window.clearInterval(syncTimer);window.clearInterval(tickTimer);
   state.currentUserId='resource-fixture';remoteDatabaseMode=true;activeBrandId='fixture';brandContextVersion++;
   let reads=0,feeds=0,performance=0,release;
   loadRemoteState=async()=>{reads++;if(reads===1)await new Promise(resolve=>release=resolve);return true};
   loadBulletinFeed=async()=>{feeds++;return true};
   isAdmin=()=>false;isTeamSales=()=>false;
   loadOwnPerformance=async()=>{performance++;return true};
   renderDashboardUpdates=()=>{};showDashboardSyncWarning=()=>{};
   completeLifecycleAuthoritativeRender=()=>{};saveDashboardCache=()=>{};
   const a=queueRemoteReload();
   const others=Array.from({length:10},()=>syncGoogleSheet({silent:true}));
   release();const joined=await Promise.all([a,...others]);
   const initial={reads,feeds,performance,joined};
   loadRemoteState=async()=>{reads++;if(reads===2)await new Promise(resolve=>release=resolve);return true};
   const b=queueRemoteReload();queueRemoteReload();release();await b;
   const invalidatedReads=reads;
   let perfRelease;
   const one=sharedPerformanceRead('fixture',()=>new Promise(resolve=>perfRelease=resolve));
   const two=sharedPerformanceRead('fixture',()=>false);
   const same=one===two;perfRelease(true);
   return {initial,invalidatedReads,same,performanceResults:await Promise.all([one,two])};
  });
  assert.equal(result.initial.reads,1);checks++;
  assert.equal(result.initial.feeds,1);checks++;
  assert.equal(result.initial.performance,1);checks++;
  assert.deepEqual(result.initial.joined,Array(11).fill(true));checks++;
  assert.equal(result.invalidatedReads,3);checks++;
  assert.equal(result.same,true);checks++;
  assert.deepEqual(result.performanceResults,[true,true]);checks++;
  console.log(`PASS ${name}: merged refreshes, mutation trailing read, performance readiness`);
  await context.close();
 }
 console.log(`PASS ${checks} resource sync browser assertions`);
} finally {await browser.close();}
