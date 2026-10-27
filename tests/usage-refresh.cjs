const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
function setup(){let performance=0,bulletins=0;const c=vm.createContext({state:{currentUserId:'u',leads:[],appointments:[],followUpDue:[],agents:[{id:'a',name:'Agent',lastSeenAt:1}]},activeBrandId:'b',brandContextVersion:1,todayKey:()=> '2026-10-19',remoteDatabaseMode:true,loadRemoteState:async()=>true,loadBulletinFeed:async()=>{bulletins++},loadOwnPerformance:async()=>{performance++;return true},isAdmin:()=>false,isTeamSales:()=>false,teamPerformanceCache:{clear(){}},renderDashboardUpdates(){},showDashboardSyncWarning(){},console});vm.runInContext(source.slice(source.indexOf('let realtimeReloadRunning'),source.indexOf('async function persistProfile')),c);return {c,counts:()=>({performance,bulletins})};}
test('unchanged poll skips performance but retains canonical dashboard and bulletin reads',async()=>{const {c,counts}=setup();await c.queueRemoteReload();await c.queueRemoteReload();assert.deepEqual(counts(),{performance:1,bulletins:2});c.state.agents[0].lastSeenAt=2;await c.queueRemoteReload();assert.equal(counts().performance,1);});
test('lead, appointment, due and brand changes refresh performance',async()=>{const {c,counts}=setup();await c.queueRemoteReload();c.state.leads.push({id:'1',status:'new'});await c.queueRemoteReload();c.state.leads[0].status='contacted';await c.queueRemoteReload();c.state.appointments.push({id:'ap',status:'show_up'});await c.queueRemoteReload();c.state.followUpDue.push({id:'1'});await c.queueRemoteReload();c.brandContextVersion++;await c.queueRemoteReload();assert.equal(counts().performance,6);});
test('failed performance read retries even when data unchanged',async()=>{const {c,counts}=setup();let fail=true;c.loadOwnPerformance=async()=>{if(fail){fail=false;return false}return true};await c.queueRemoteReload();await c.queueRemoteReload();await c.queueRemoteReload();assert.equal(counts().bulletins,3);});
test('compact payload retains every field consumed by mapLead and full assignment history',()=>{const original=fs.readFileSync('supabase/migrations/20261018183242_reduce_dashboard_and_idle_push_usage.sql','utf8');const sql=original+fs.readFileSync('supabase/migrations/20261026142609_agent_neglected_leads.sql','utf8');const mapper=source.slice(source.indexOf('function mapLead('),source.indexOf('function mapActivity('));for(const match of mapper.matchAll(/row\.([a-z_]+)/g)){if(['dedupe_key','project','assignment_history'].includes(match[1]))continue;assert.ok(sql.includes(`'${match[1]}'`),match[1]);}assert.doesNotMatch(original,/delete from|update public.leads/i);});
test('only failed background polls back off; realtime and manual actions stay immediate',async()=>{
 const {c}=setup();let calls=0;c.loadRemoteState=async()=>{calls++;return false};
 await c.queueRemoteReload({backgroundPoll:true});
 await c.queueRemoteReload({backgroundPoll:true});assert.equal(calls,1);
 await c.queueRemoteReload();assert.equal(calls,2);
 c.brandContextVersion++;await c.queueRemoteReload({backgroundPoll:true});assert.equal(calls,3);
 c.loadRemoteState=async()=>{calls++;return true};await c.queueRemoteReload();
 await c.queueRemoteReload({backgroundPoll:true});assert.equal(calls,5);
});
test('simultaneous identical presence heartbeats coalesce without changing cadence or lease RPC',async()=>{
 let calls=0,release;const wait=new Promise(resolve=>release=resolve);
 const c=vm.createContext({Date,Notification:{permission:'granted'},getCurrentUser:()=>({id:'a',role:'agent'}),remoteDatabaseMode:true,remoteDatabaseClient:{rpc:async()=>{calls++;await wait;return {data:{ok:true}}}},brandContextVersion:1,lastAgentPresenceHeartbeatAt:0,agentPresenceSessionStartedAt:123,AGENT_PRESENCE_HEARTBEAT_MS:300000});
 vm.runInContext(source.slice(source.indexOf('let agentPresenceRequest ='),source.indexOf('async function setAgentLeadAvailability(')),c);
 const a=c.updateAgentPresence(true),b=c.updateAgentPresence(true);assert.equal(calls,1);release();assert.deepEqual(await Promise.all([a,b]),[true,true]);
});
test('retention scans bounded PK pages before eligibility and does not schedule deletion on install',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261020152610_optimize_cron_retention_batches.sql','utf8');
 assert.match(sql,/scanned as materialized/);assert.match(sql,/runid>cursor_id order by runid limit 2000/);
 assert.match(sql,/for update of d skip locked/);assert.match(sql,/order by s.runid limit 1000/);assert.match(sql,/coalesce\(scanned_id,0\)/);
 assert.match(sql,/cross join lateral/);assert.match(sql,/where d.ctid=v.tid/);
 assert.match(sql,/status='succeeded'.*7 days/);assert.match(sql,/status='failed'.*30 days/);
 assert.doesNotMatch(sql,/cron.schedule|delete from public\.|alter.*owner|grant /i);
 const release=fs.readFileSync('scripts/release-safe-log-retention.mjs','utf8');
 assert.match(release,/if\(!rows.length\)\{after=next;continue;\}/);
 assert.doesNotMatch(release,/limit 50000|dailySweep|query\('vacuum/);
});
test('presence response from an old brand cannot confirm the current session',async()=>{
 let release;const wait=new Promise(resolve=>release=resolve);
 const c=vm.createContext({Date,Notification:{permission:'granted'},getCurrentUser:()=>({id:'a',role:'agent'}),remoteDatabaseMode:true,remoteDatabaseClient:{rpc:async()=>{await wait;return {data:{ok:true}}}},brandContextVersion:1,lastAgentPresenceHeartbeatAt:0,agentPresenceSessionStartedAt:123,AGENT_PRESENCE_HEARTBEAT_MS:300000});
 vm.runInContext(source.slice(source.indexOf('let agentPresenceRequest ='),source.indexOf('async function setAgentLeadAvailability(')),c);
 const pending=c.updateAgentPresence(true);c.brandContextVersion++;release();
 assert.equal(await pending,false);assert.equal(c.lastAgentPresenceHeartbeatAt,0);
});
test('a failed read does not immediately replay an accumulated event burst',async()=>{
 const {c}=setup();let release,calls=0;const wait=new Promise(resolve=>release=resolve);
 c.loadRemoteState=async()=>{calls++;await wait;return false};
 const first=c.queueRemoteReload();c.queueRemoteReload();c.queueRemoteReload();release();await first;
 assert.equal(calls,1);
});

test('poll, refresh and resume join a running sync without a redundant trailing read',async()=>{
 const {c,counts}=setup();let release,calls=0;
 c.loadRemoteState=async()=>{calls++;await new Promise(resolve=>release=resolve);return true};
 const first=c.queueRemoteReload();
 const joins=Array.from({length:20},(_,i)=>c.queueRemoteReload(i%2?{backgroundPoll:true}:{joinCurrent:true}));
 release();assert.deepEqual(await Promise.all([first,...joins]),Array(21).fill(true));
 assert.equal(calls,1);assert.equal(counts().performance,1);assert.equal(counts().bulletins,1);
});
test('hidden pages skip only fallback polls; realtime and resume remain immediate',async()=>{
 const {c}=setup();let calls=0;c.document={visibilityState:'hidden'};
 c.loadRemoteState=async()=>{calls++;return true};
 assert.equal(await c.queueRemoteReload({backgroundPoll:true}),false);assert.equal(calls,0);
 assert.equal(await c.queueRemoteReload(),true);
 assert.equal(await c.queueRemoteReload({joinCurrent:true}),true);assert.equal(calls,2);
 c.document.visibilityState='visible';await c.queueRemoteReload({backgroundPoll:true});assert.equal(calls,3);
});
test('a mutation arriving during a read still forces a fresh trailing snapshot',async()=>{
 const {c}=setup();let release,calls=0;
 c.loadRemoteState=async()=>{calls++;if(calls===1)await new Promise(resolve=>release=resolve);return true};
 const first=c.queueRemoteReload();c.queueRemoteReload();c.queueRemoteReload({joinCurrent:true});
 release();assert.equal(await first,true);assert.equal(calls,2);
});
test('lifecycle with a ready snapshot loads feeds and performance without rereading dashboard',async()=>{
 const {c,counts}=setup();let calls=0;c.loadRemoteState=async()=>{calls++;return true};
 assert.equal(await c.queueRemoteReload({snapshotReady:true,joinCurrent:true}),true);
 assert.equal(calls,0);assert.deepEqual(counts(),{performance:1,bulletins:1});
});
test('sync failure and permission context changes cannot report success',async()=>{
 const {c}=setup();c.loadOwnPerformance=async()=>false;
 assert.equal(await c.queueRemoteReload(),false);
 let release;c.loadRemoteState=async()=>{await new Promise(resolve=>release=resolve);return true};
 const pending=c.queueRemoteReload();c.brandContextVersion++;release();assert.equal(await pending,false);
});
test('a new brand waits for its own fresh snapshot instead of the old flight result',async()=>{
 const {c}=setup();let release,calls=0;
 c.loadRemoteState=async()=>{calls++;if(calls===1)await new Promise(resolve=>release=resolve);return true};
 const old=c.queueRemoteReload();c.brandContextVersion++;
 const current=c.queueRemoteReload({joinCurrent:true});release();
 assert.equal(await old,false);assert.equal(await current,true);assert.equal(calls,2);
});
test('performance readers await the same result and isolate brand and range',async()=>{
 const c=vm.createContext({state:{currentUserId:'a'},brandContextVersion:1,todayKey:()=> '2026-10-27'});
 vm.runInContext(source.slice(source.indexOf('const performanceReadRequests ='),source.indexOf('function loadTeamPerformance()')),c);
 let release,calls=0;const work=async()=>{calls++;await new Promise(resolve=>release=resolve);return true};
 const a=c.sharedPerformanceRead('own',work),b=c.sharedPerformanceRead('own',work);
 assert.equal(a,b);assert.equal(calls,1);
 c.brandContextVersion++;assert.equal(await c.sharedPerformanceRead('own',()=>true),true);
 assert.equal(await c.sharedPerformanceRead('team:1',()=>true),true);
 release();assert.deepEqual(await Promise.all([a,b]),[true,true]);
 await assert.rejects(c.sharedPerformanceRead('own',()=>{throw Error('offline')}));
 assert.equal(await c.sharedPerformanceRead('own',()=>true),true);
});
