const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('app.js','utf8');
test('remote login never writes duplicate legacy snapshots',()=>{
 let cached=0;
 const c=vm.createContext({remoteDatabaseMode:true,localStorage:{setItem:()=>{throw new Error('quota');}},saveDashboardCache:()=>cached++});
 vm.runInContext(source.slice(source.indexOf('function saveState()'),source.indexOf('function dashboardCacheKey')),c);
 c.saveState();assert.equal(cached,1);
});
test('unavailable local storage does not interrupt successful data loading',()=>{
 let cached=0;
 const c=vm.createContext({remoteDatabaseMode:false,state:{},STORAGE_KEY:'fixture',console:{warn:()=>{}},localStorage:{setItem:()=>{throw new Error('quota');}},saveDashboardCache:()=>cached++});
 vm.runInContext(source.slice(source.indexOf('function saveState()'),source.indexOf('function dashboardCacheKey')),c);
 assert.doesNotThrow(()=>c.saveState());assert.equal(cached,1);
});
test('a dashboard error alone cannot revoke login on this or other devices',()=>{
 assert.doesNotMatch(source,/if \(!isTransientRemoteLoadError\(lastRemoteLoadError\)\) await remoteDatabaseClient.auth.signOut/);
 assert.match(source,/if \(isInvalidAuthSessionError\(lastRemoteLoadError\)\) await remoteDatabaseClient.auth.signOut\(\{ scope: 'local' \}\)/);
});
