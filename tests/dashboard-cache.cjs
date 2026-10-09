const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
test('Overlapping reads coalesce; a new brand context starts an independent read',async()=>{
 let reads=0;const pending=[];
 const c=vm.createContext({state:{currentUserId:'u'},brandContextVersion:0,dashboardReadRequests:new Map(),
  performLoadRemoteState(){reads++;return new Promise(resolve=>pending.push(resolve));}});
 vm.runInContext(source.slice(source.indexOf('async function loadRemoteState('),source.indexOf('async function performLoadRemoteState(')),c);
 const first=c.loadRemoteState('u'),second=c.loadRemoteState('u');
 assert.equal(reads,1);
 c.brandContextVersion++;
 const next=c.loadRemoteState('u');assert.equal(reads,2);
 pending.forEach(resolve=>resolve(true));
 await Promise.all([first,second,next]);assert.equal(c.dashboardReadRequests.size,0);
});
function fixture(){
 const entries=new Map();let denied=false,offline=false;
 const user={id:'u',role:'agent',brandId:'b',active:true,approvalStatus:'approved'};
 const brand={id:'b',active:true,distribution_mode:'agent'};
 const c=vm.createContext({structuredClone,Date,console,
  state:{currentUserId:'u',agents:[{...user,password:'not-for-cache'}],leads:[{id:'l',brandId:'b',status:'new',phone:'60173559147',email:'test@example.com',notes:'Nama test +60 17-355 9147 test@example.com'}]},
  defaultState:{},activeBrandId:'b',activeBrand:brand,remoteDatabaseMode:true,
  monitorLastCanonicalSyncAt:Date.now(),dashboardCacheMetrics:{own:{current:{rows:[]},previous:{rows:[]}}},startupFromCache:false,
  getCurrentUser(){return c.state.agents.find(a=>a.id===c.state.currentUserId);},
  localStorage:{getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v)},sessionStorage:{getItem:()=>null},
  isTransientRemoteLoadError:e=>e?.code==='FETCH',showDashboardSyncWarning(){},
  remoteDatabaseClient:{from:table=>{const q={select(){return q},eq(){return q},single:async()=>offline?{error:{code:'FETCH'}}:{data:table==='profiles'?{id:'u',role:'agent',brand_id:'b',active:!denied,approval_status:'approved'}:brand}};return q;}},
 });
 vm.runInContext(source.slice(source.indexOf('function dashboardCacheKey('),source.indexOf('function showDashboardSyncWarning(')),c);
 return {c,entries,deny:()=>denied=true,offline:()=>offline=true};
}
test('Scoped cache strips New contact and passwords, restores only trusted user/brand',async()=>{
 const {c,entries}=fixture();c.saveDashboardCache();const raw=entries.get(c.dashboardCacheKey('u','b'));
 assert.ok(raw);assert.doesNotMatch(raw,/60173559147|test@example.com|not-for-cache/);
 assert.equal(await c.restoreTrustedDashboardCache('u'),true);
 assert.equal(await c.restoreTrustedDashboardCache('other'),false);
});
test('Denied access and foreign brand records never restore cached operations',async()=>{
 const f=fixture();f.c.saveDashboardCache();f.deny();assert.equal(await f.c.restoreTrustedDashboardCache('u'),false);
 const g=fixture();g.c.state.leads[0].brandId='foreign';g.c.saveDashboardCache();assert.equal(await g.c.restoreTrustedDashboardCache('u'),false);
});
test('Offline own-session cache fallback retains dashboard; partial or stale cache is rejected',async()=>{
 const f=fixture();f.c.saveDashboardCache();f.offline();assert.equal(await f.c.restoreTrustedDashboardCache('u'),true);
 const key=f.c.dashboardCacheKey('u','b');const cached=JSON.parse(f.entries.get(key));cached.savedAt=Date.now()-2*86400000;f.entries.set(key,JSON.stringify(cached));
 assert.equal(await f.c.restoreTrustedDashboardCache('u'),false);
 const g=fixture();g.c.dashboardCacheMetrics={};g.c.saveDashboardCache();assert.equal(await g.c.restoreTrustedDashboardCache('u'),false);
});
test('Resume is silent and background refresh uses selective renderers',()=>{
 const resume=source.slice(source.indexOf('function beginResumeSync('),source.indexOf('function openLeadAvailabilityConfirmation'));
 assert.doesNotMatch(resume,/showLifecycleSyncOverlay/);
 const render=source.slice(source.indexOf('function renderDashboardUpdates('),source.indexOf('function openContactOutbox('));
 assert.doesNotMatch(render,/renderAll\(/);
 assert.match(render,/fingerprint/);
 assert.match(source,/LIFECYCLE_INTRO_DURATION_MS = 250/);
});
