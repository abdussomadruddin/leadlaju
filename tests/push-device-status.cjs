const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
test('Device statuses separate account permission, stale receipts, tests and logout',()=>{
 const c=vm.createContext({Date});
 vm.runInContext(app.slice(app.indexOf('function pushDeviceLabel('),app.indexOf('function renderAgentPushDevices(')),c);
 assert.equal(c.pushDeviceLabel({active:true}),'Belum disahkan');
 assert.equal(c.pushDeviceLabel({active:true,receivedAt:new Date().toISOString()}),'Belum disahkan');
 assert.equal(c.pushDeviceLabel({active:true,checkAt:new Date(Date.now()-1000).toISOString(),checkReceivedAt:new Date().toISOString()}),'Sedia terima notifikasi');
 assert.equal(c.pushDeviceLabel({active:true,checkAt:new Date().toISOString(),checkReceivedAt:new Date(Date.now()-1000).toISOString()}),'Belum disahkan');
 assert.equal(c.pushDeviceLabel({active:true,checkConfirmedAt:new Date().toISOString(),checkReady:false}),'Terputus · permission tidak dibenarkan');
 assert.equal(c.pushDeviceLabel({active:false,loggedOutAt:new Date().toISOString()}),'Log keluar');
 assert.equal(c.pushDeviceLabel({active:false}),'Terputus');
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
