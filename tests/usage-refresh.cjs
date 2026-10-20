const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
function setup(){let performance=0,bulletins=0;const c=vm.createContext({state:{currentUserId:'u',leads:[],appointments:[],followUpDue:[],agents:[{id:'a',name:'Agent',lastSeenAt:1}]},activeBrandId:'b',brandContextVersion:1,todayKey:()=> '2026-10-19',remoteDatabaseMode:true,loadRemoteState:async()=>true,loadBulletinFeed:async()=>{bulletins++},loadOwnPerformance:async()=>{performance++;return true},isAdmin:()=>false,isTeamSales:()=>false,teamPerformanceCache:{clear(){}},renderDashboardUpdates(){},showDashboardSyncWarning(){},console});vm.runInContext(source.slice(source.indexOf('let realtimeReloadRunning'),source.indexOf('async function persistProfile')),c);return {c,counts:()=>({performance,bulletins})};}
test('unchanged poll skips performance but retains canonical dashboard and bulletin reads',async()=>{const {c,counts}=setup();await c.queueRemoteReload();await c.queueRemoteReload();assert.deepEqual(counts(),{performance:1,bulletins:2});c.state.agents[0].lastSeenAt=2;await c.queueRemoteReload();assert.equal(counts().performance,1);});
test('lead, appointment, due and brand changes refresh performance',async()=>{const {c,counts}=setup();await c.queueRemoteReload();c.state.leads.push({id:'1',status:'new'});await c.queueRemoteReload();c.state.leads[0].status='contacted';await c.queueRemoteReload();c.state.appointments.push({id:'ap',status:'show_up'});await c.queueRemoteReload();c.state.followUpDue.push({id:'1'});await c.queueRemoteReload();c.brandContextVersion++;await c.queueRemoteReload();assert.equal(counts().performance,6);});
test('failed performance read retries even when data unchanged',async()=>{const {c,counts}=setup();let fail=true;c.loadOwnPerformance=async()=>{if(fail){fail=false;return false}return true};await c.queueRemoteReload();await c.queueRemoteReload();await c.queueRemoteReload();assert.equal(counts().bulletins,3);});
test('compact payload retains every field consumed by mapLead and full assignment history',()=>{const sql=fs.readFileSync('supabase/migrations/20261018183242_reduce_dashboard_and_idle_push_usage.sql','utf8');const mapper=source.slice(source.indexOf('function mapLead('),source.indexOf('function mapActivity('));for(const match of mapper.matchAll(/row\.([a-z_]+)/g)){if(['dedupe_key','project','assignment_history'].includes(match[1]))continue;assert.ok(sql.includes(`'${match[1]}'`),match[1]);}assert.doesNotMatch(sql,/delete from|update public.leads/i);});
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
