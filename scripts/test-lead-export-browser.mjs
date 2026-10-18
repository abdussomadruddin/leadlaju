import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=fs.readFileSync('app.js','utf8');
const functions=source.slice(source.indexOf('let leadExportRunning'),source.indexOf('function downloadFile('));
const html=fs.readFileSync('index.html','utf8');
const controls=html.slice(html.indexOf('<section class="view" id="leads-view">'),html.indexOf('<div class="table-card">',html.indexOf('<section class="view" id="leads-view">')));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const device of [{viewport:{width:1366,height:900}},devices['iPhone 13'],devices['Pixel 7']]) {
  const context=await browser.newContext({...device,serviceWorkers:'block'});const page=await context.newPage();
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/app.js*',r=>r.abort());
  await page.goto('http://127.0.0.1:8769',{waitUntil:'commit'});
  await page.setContent(`<link rel="stylesheet" href="http://127.0.0.1:8769/styles.css"><main>${controls}</section></main>`);
  await page.addScriptTag({path:require.resolve('exceljs/dist/exceljs.min.js')});
  await page.evaluate(functions+`\nwindow.role='admin'; window.downloads=[]; window.calls=0;
   window.isAdmin=()=>window.role!=='agent';window.remoteDatabaseMode=true;window.activeBrandId='brand';window.brandContextVersion=1;window.state={currentUserId:'admin'};window.LEAD_STATUS_LABELS={new:'New'};
   window.remoteDatabaseClient={rpc:async()=>{window.calls++;await new Promise(r=>setTimeout(r,100));return {data:{brand_id:'brand',brand_name:'Safrich',distribution_mode:'agent',cutoff:new Date().toISOString(),total:1,has_more:false,rows:[{id:'1',name:'Nama',phone:'0123456789',notes:'Nota\\nBaris dua',status:'new'}]}}}};
   window.downloadFile=(blob,name)=>window.downloads.push({size:blob.size,name});
   document.querySelector('#leads-view').style.display='block';document.querySelector('#export-all-leads').addEventListener('click',exportAllBrandLeads);`);
  const button=page.locator('#export-all-leads');await button.click();
  await page.waitForFunction(()=>window.downloads.length===1);
  assert.equal(await button.isEnabled(),true);assert.match(await page.locator('#lead-export-progress').textContent(),/1 lead berjaya/);
  assert.equal(await page.evaluate(()=>window.downloads[0].size>1000),true);
  await page.evaluate(()=>{window.role='agent';});await button.click();assert.equal(await page.evaluate(()=>window.calls),1);
  await context.close();
 }
 console.log('PASS: Excel export button, actual browser Excel generation, progress and role gate on desktop/iPhone/Android');
} finally {await browser.close();}
