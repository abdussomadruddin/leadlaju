const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const helper=source.slice(source.indexOf('function leadMonitorDataVerified('),source.indexOf('function renderLeadMonitor('));
test('monitor never reports verified for failed, old, missing or non-server data',()=>{
 const c=vm.createContext({remoteDatabaseMode:true,monitorSyncFailed:false,monitorLastCanonicalSyncAt:100000});vm.runInContext(helper,c);
 assert.equal(c.leadMonitorDataVerified(100001),true);assert.equal(c.leadMonitorDataVerified(189999),true);assert.equal(c.leadMonitorDataVerified(190000),false);
 c.monitorSyncFailed=true;assert.equal(c.leadMonitorDataVerified(100001),false);c.monitorSyncFailed=false;c.monitorLastCanonicalSyncAt=null;assert.equal(c.leadMonitorDataVerified(100001),false);
 c.monitorLastCanonicalSyncAt=100000;c.remoteDatabaseMode=false;assert.equal(c.leadMonitorDataVerified(100001),false);
});
test('monitor state resets on brand switch and logout, and ignores previous-brand replies',()=>{
 const clear=source.slice(source.indexOf('function clearBrandOperationalState()'),source.indexOf('async function changeMasterBrand('));
 const logout=source.slice(source.indexOf('function logout()'),source.indexOf('function togglePasswordVisibility()'));
 assert.match(clear,/monitorLastCanonicalSyncAt = null/);assert.match(logout,/monitorLastCanonicalSyncAt = null/);
 assert.match(source,/await loadFollowUpDueFeed\(\);\s*if \(requestBrandVersion !== brandContextVersion\) return false;\s*monitorLastCanonicalSyncAt = Date\.now\(\)/);
});
test('failed refresh is explicit and cannot display success or issue counts',()=>{
 const handler=source.slice(source.indexOf('elements.monitorRefreshButton?.addEventListener'),source.indexOf('elements.monitorList?.addEventListener'));
 assert.match(handler,/if \(!synced\)[\s\S]*showToast\("Pemeriksaan gagal"[\s\S]*return;/);
 assert.match(source,/!canVerify \? "Tidak disahkan"/);assert.match(source,/monitorCriticalCount\.textContent = canVerify \? critical : "-"/);
});
