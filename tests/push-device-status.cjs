const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
test('Device report requests are admin-only, on-demand and coalesced',async()=>{
 let admin=false,open=false,calls=0,release;
 const gate=new Promise(resolve=>release=resolve);
 const c=vm.createContext({console,document:{querySelector:()=>({open})},isAdmin:()=>admin,renderPushDeviceReport:()=>{},window:{clearTimeout,setTimeout}});
 vm.runInContext('let remoteDatabaseMode=true,brandContextVersion=1,remoteDatabaseClient={rpc:()=>rpc()};',c);
 c.rpc=async()=>{calls++;await gate;return {data:[]};};
 vm.runInContext(app.slice(app.indexOf('let pushDeviceStatus ='),app.indexOf('function renderPushDeviceReport(')),c);
 await c.loadPushDeviceStatus();assert.equal(calls,0);
 admin=true;await c.loadPushDeviceStatus();assert.equal(calls,0);
 open=true;const first=c.loadPushDeviceStatus(),second=c.loadPushDeviceStatus();
 assert.equal(calls,1);release();await Promise.all([first,second]);
});
test('Device statuses separate account permission, stale receipts, tests and logout',()=>{
 const c=vm.createContext({Date});
 vm.runInContext(app.slice(app.indexOf('function pushDeviceLabel('),app.indexOf('function renderAgentPushDevices(')),c);
 assert.equal(c.pushDeviceLabel({active:true}),'Belum disahkan');
 assert.equal(c.pushDeviceLabel({active:true,receivedAt:new Date().toISOString()}),'Belum disahkan');
 assert.equal(c.pushDeviceLabel({active:true,checkAt:new Date(Date.now()-1000).toISOString(),checkReceivedAt:new Date().toISOString()}),'Sedia terima notifikasi');
 assert.equal(c.pushDeviceLabel({active:true,checkAt:new Date().toISOString(),checkReceivedAt:new Date(Date.now()-1000).toISOString()}),'Belum disahkan');
 assert.equal(c.pushDeviceLabel({active:true,checkAt:new Date(Date.now()-61000).toISOString()}),'Belum disahkan');
 assert.equal(c.pushDeviceLabel({active:true,checkAt:new Date(Date.now()-90000).toISOString(),checkReceivedAt:new Date().toISOString()}),'Belum disahkan');
 assert.equal(c.pushDeviceLabel({active:true,checkConfirmedAt:new Date().toISOString(),checkReady:false}),'Belum disahkan');
 assert.equal(c.pushDeviceLabel({active:false,loggedOutAt:new Date().toISOString()}),'Terputus');
 assert.equal(c.pushDeviceLabel({active:false}),'Terputus');
});
test('Device download groups each device by the same live status and retains agents without devices',()=>{
 const c=vm.createContext({Date});
 vm.runInContext(app.slice(app.indexOf('function pushDeviceLabel('),app.indexOf('async function downloadPushDeviceReport(')),c);
 const now=new Date().toISOString();
 const groups=c.pushDeviceExportRows([{id:'a',name:'Aina',role:'agent'},{id:'b',name:'B',role:'agent'},{id:'admin',role:'admin'}],[
  {userId:'a',device:'iPhone',active:true,checkAt:now,checkReceivedAt:now},
  {userId:'a',device:'Android',active:true},
  {userId:'a',device:'Browser',active:false},
  {userId:'other-brand',active:false},
 ]);
 assert.deepEqual(Array.from(groups,g=>[g.status,g.rows.length]),[['Sedia terima notifikasi',1],['Belum disahkan',2],['Terputus',1]]);
 assert.equal(groups[1].rows[1][1],'Tiada rekod peranti');
 assert.equal(groups[2].rows[0][1],'Browser');
});
test('Device export is admin-only, refreshes status without sending reminders and cancels after context changes',()=>{
 const fn=app.slice(app.indexOf('async function downloadPushDeviceReport('),app.indexOf('function renderAgentPushDevices('));
 assert.match(fn,/if \(!isAdmin\(\) \|\| button.disabled/);
 assert.match(fn,/await loadPushDeviceStatus\(\)/);
 assert.match(fn,/version === brandContextVersion && user === state.currentUserId/);
 assert.match(fn,/await workbook.xlsx.writeBuffer\(\);\s*if \(!valid\(\)\) return/);
 assert.doesNotMatch(fn,/broadcast_follow_up_reminder|\.rpc\(/);
 assert.match(fs.readFileSync('index.html','utf8'),/id="download-push-device-report"[^>]*disabled/);
});
test('Device Excel roundtrip contains three tabs, literal names, frozen headers and no endpoint secrets',async()=>{
 const ExcelJS=require('../vendor/exceljs.min.js');
 // Browser uses one realm; bridge VM fixture arrays into ExcelJS's Node realm.
 class Workbook extends ExcelJS.Workbook { addWorksheet(name,options) { const sheet=super.addWorksheet(name,JSON.parse(JSON.stringify(options))); const add=sheet.addRow.bind(sheet); sheet.addRow=row=>add(Array.from(row)); return sheet; } }
 let blob,filename;
 const c=vm.createContext({Date,Intl,Blob,isAdmin:()=>true,isTeamSales:()=>false,document:{querySelector:()=>({open:true})},window:{ExcelJS:{Workbook}},beginButtonFeedback:()=>()=>{},loadPushDeviceStatus:async()=>true,downloadFile:(b,n)=>{blob=b;filename=n;},showToast:(_,message)=>{throw Error(message);}});
 vm.runInContext('let brandContextVersion=1,state={currentUserId:"admin",agents:[{id:"a",role:"agent",name:"=Agent"}]},activeBrand={name:"Safrich"},pushDeviceStatus=[{userId:"a",device:"iPhone",active:false,endpoint:"SECRET"}];',c);
 vm.runInContext(app.slice(app.indexOf('function pushDeviceLabel('),app.indexOf('function renderAgentPushDevices(')),c);
 const button={disabled:false};
 await c.downloadPushDeviceReport(button);
 assert.ok(filename.endsWith('.xlsx'));assert.equal(button.disabled,false);
 const book=new ExcelJS.Workbook();await book.xlsx.load(await blob.arrayBuffer());
 assert.equal(book.worksheets.length,3);
 assert.equal(book.getWorksheet('Terputus').getCell('B2').value,'=Agent');
 assert.equal(book.getWorksheet('Terputus').getCell('C2').value,'iPhone');
 assert.equal(book.getWorksheet('Terputus').views[0].ySplit,1);
 assert.equal(book.getWorksheet('Terputus').columnCount,7);
});
test('Receipt is sent after showNotification, with public API key only',()=>{
 const sw=fs.readFileSync('sw.js','utf8');
 const delivery=sw.slice(sw.indexOf('async function deliverLeadNotification('),sw.indexOf('const PUSH_RECEIPT_CACHE'));
 assert.ok(delivery.indexOf('await showLeadNotification')<delivery.indexOf('queuePushReceipt'));
 assert.match(sw,/acknowledge_push_receipt/);
 assert.doesNotMatch(sw,/SUPABASE_SERVICE_ROLE_KEY/);
 const worker=fs.readFileSync('supabase/functions/process-notification-outbox/index.ts','utf8');
 assert.match(worker,/receiptToken: token/);
});
test('Silent smoke check does not create notifications and app response does not claim push delivery',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261008125848_push_device_receipts.sql','utf8');
 const check=sql.slice(sql.indexOf('create function public.admin_check_push_device'),sql.indexOf('create function public.answer_push_device_probe'));
 assert.doesNotMatch(check,/notification_outbox|device_test/);
 assert.match(check,/push_device_probe/);
 assert.match(app,/#check-all-push-devices/);
 assert.doesNotMatch(app,/data-test-push-device/);
 assert.match(app,/Menunggu pengesahan push reminder/);
});
