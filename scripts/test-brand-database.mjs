// Real PostgreSQL integration suite. Only infrastructure transports (Cron, Vault,
// Realtime) are stubbed; migrations, RLS, RPCs, constraints and transactions are real.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.LEADLAJU_TEST_PG_MODULE;
if (!modulePath) throw new Error('Set LEADLAJU_TEST_PG_MODULE to embedded-postgres dist/index.js');
const { default: EmbeddedPostgres } = await import(pathToFileURL(modulePath));
const root = path.resolve(import.meta.dirname, '..');
const pg = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(os.tmpdir(),'leadlaju-pg-')), user:'postgres', password:'local-test-only', port:55439, persistent:false, onLog:()=>{}, onError:()=>{} });
let client;
let checks=0;
const check = (condition,message) => { assert.ok(condition,message); checks++; };
try {
 await pg.initialise(); await pg.start(); client=pg.getPgClient(); await client.connect();
 await client.query(`
 create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth to authenticated,service_role;
 create schema realtime;
 grant usage on schema realtime to authenticated;
 create table realtime.messages(topic text,extension text);
 alter table realtime.messages enable row level security;
 grant select on realtime.messages to authenticated;
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
 create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select null::void$$;
 create function realtime.broadcast_changes(text,text,text,text,text,anyelement,anyelement) returns void language sql as $$select null::void$$;
 create schema cron; create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text);
 create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=$2,command=$3 returning jobid$$;
 create function cron.unschedule(bigint) returns boolean language sql as $$with d as(delete from cron.job where jobid=$1 returning *) select exists(select 1 from d)$$;
 create schema vault; create table vault.secrets(name text,secret text); create view vault.decrypted_secrets as select name,secret as decrypted_secret from vault.secrets;
 `);
 const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
 const legacyId='20000000-0000-4000-8000-000000000001';
 let legacyCounts;
 for(const file of files) {
   if(file.endsWith('_master_brand_isolation.sql')) {
     await client.query(`insert into public.projects(id,name,source_project_id) values($1,'Legacy Safrich Project','legacy-source')`,[legacyId]);
     legacyCounts=(await client.query(`select table_name,(xpath('/row/c/text()',query_to_xml(format('select count(*) c from public.%I',table_name),false,true,'')))[1]::text::int count from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)).rows;
   }
   // The historical foundation was consolidated after these two index fixes.
   // Normalize only that redundant historical step for a fresh test database.
   if(file.endsWith('_fix_import_conflict_targets.sql')) await client.query('alter table public.leads drop constraint leads_source_identity_unique; alter table public.reminders drop constraint reminders_source_reminder_id_unique');
   let sql=fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8').replace(/create extension if not exists (pg_net|pg_cron)( with schema \w+)?;/g,'');
   try { await client.query(sql); } catch(e) { throw new Error(`Migration ${file}: ${e.message}`,{cause:e}); }
 }
 await client.query('grant all on all tables in schema public to service_role; grant usage,select on all sequences in schema public to service_role');
 for(const row of legacyCounts) {
   const count=(await client.query(`select count(*)::int n from public."${row.table_name}"`)).rows[0].n;
   check(count===row.count,`Safrich backfill preserves ${row.table_name} records`);
 }
 check((await client.query('select brand_id from public.projects where id=$1',[legacyId])).rows[0].brand_id==='00000000-0000-4000-8000-000000000001','Backfill preserves legacy ID and maps to Safrich');
 const sa='00000000-0000-4000-8000-000000000001', sb='00000000-0000-4000-8000-000000000002';
 const master='10000000-0000-4000-8000-000000000001', adminA='10000000-0000-4000-8000-000000000002', adminB='10000000-0000-4000-8000-000000000003', agentA='10000000-0000-4000-8000-000000000004', agentB='10000000-0000-4000-8000-000000000005';
 await client.query(`insert into auth.users(id,email) values($1,'lurbaymarketing@gmail.com'),($2,'admin-a@example.test'),($3,'admin-b@example.test'),($4,'agent-a@example.test'),($5,'agent-b@example.test')`,[master,adminA,adminB,agentA,agentB]);
 await client.query(`select public.bootstrap_first_master($1,'lurbaymarketing@gmail.com')`,[master]);
 await client.query(`insert into public.brands(id,name,slug) values($1,'Brand B','brand-b')`,[sb]);
 await client.query(`insert into public.dispatch_state(brand_id,singleton) values($1,true)`,[sb]);
 for(const [id,b,role] of [[adminA,sa,'admin'],[adminB,sb,'admin'],[agentA,sa,'agent'],[agentB,sb,'agent']])
   await client.query(`insert into public.profiles(id,name,email,role,approval_status,active,brand_id) values($1::uuid,$3::text,$1::text||'@example.test',$3::public.leadlaju_role,'approved',true,$2::uuid)`,[id,b,role]);
 const asUser=async(user,brand,fn)=>{
   await client.query('begin');
   try {
     await client.query(`select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)`,[JSON.stringify({sub:user,role:'authenticated'}),JSON.stringify(brand?{'x-leadlaju-brand':brand}:{})]);
     await client.query('set local role authenticated');
     return await fn();
   } finally { await client.query('rollback'); }
 };
 const rejects=async(fn,message)=>{await assert.rejects(fn);checks++;};
 // Real RPC writes are committed separately to retain fixtures between checks.
 const commitUser=async(user,brand,sql,args=[])=>{
   await client.query('begin');
   try {await client.query(`select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)`,[JSON.stringify({sub:user,role:'authenticated'}),JSON.stringify({'x-leadlaju-brand':brand})]); await client.query('set local role authenticated'); const r=await client.query(sql,args); await client.query('commit');return r;}
   catch(e){await client.query('rollback');throw e;}
 };
 const pa=(await commitUser(adminA,sa,`select public.admin_upsert_project('{"name":"Same Project"}') x`)).rows[0].x.project.id;
 const pb=(await commitUser(adminB,sb,`select public.admin_upsert_project('{"name":"Same Project"}') x`)).rows[0].x.project.id;
 check(pa!==pb,'Identical project names are isolated');
 const body={id:'identical-source',name:'Fixture',phone:'60120000000',project:'Same Project'};
 const la=(await commitUser(adminA,sa,`select public.admin_ingest_manual_lead($1) x`,[body])).rows[0].x.lead_id;
 const lb=(await commitUser(adminB,sb,`select public.admin_ingest_manual_lead($1) x`,[body])).rows[0].x.lead_id;
 check(la!==lb,'Identical source identity is isolated');
 for(const [id,b,project] of [[agentA,sa,pa],[agentB,sb,pb]]) {
   await client.query(`insert into public.agent_project_eligibility(agent_id,project_id,brand_id) values($1,$2,$3)`,[id,project,b]);
   await client.query(`insert into public.agent_availability(agent_id,brand_id,lead_ready,notification_ready,presence_lease_until) values($1,$2,true,true,now()+interval '1 hour')`,[id,b]);
   await client.query(`insert into public.push_subscriptions(user_id,brand_id,endpoint,p256dh,auth,user_agent) values($1::uuid,$2,$1::text,'test','test','iPhone Safari')`,[id,b]);
 }
 await commitUser(adminA,sa,`select public.admin_set_all_agent_lead_readiness(true)`);
 const queueA=(await client.query('select * from public.leads where id=$1',[la])).rows[0];
 const queueB=(await client.query('select * from public.leads where id=$1',[lb])).rows[0];
 check(queueA.assigned_agent_id===agentA && queueB.assigned_agent_id===null,'Admin dispatch does not advance another brand');
 check((await client.query('select queue_cycle from public.dispatch_state where brand_id=$1',[sb])).rows[0].queue_cycle==='0','Other brand cycle unaffected');
 await client.query('select leadlaju_private.dispatch_available_leads(now())');
 check((await client.query('select assigned_agent_id from public.leads where id=$1',[lb])).rows[0].assigned_agent_id===agentB,'Cron dispatch independently processes all active brands');
 const outbox=(await client.query('select n.brand_id,p.brand_id recipient_brand,l.brand_id lead_brand from public.notification_outbox n join public.profiles p on p.id=n.user_id join public.leads l on l.id=n.lead_id')).rows;
 check(outbox.length===2&&outbox.every(x=>x.brand_id===x.recipient_brand&&x.brand_id===x.lead_brand),'Assignment outbox remains same brand');
 const revision=(await client.query('select assignment_revision from public.leads where id=$1',[la])).rows[0].assignment_revision;
 await rejects(()=>asUser(agentB,sb,()=>client.query('select public.contact_assignment(gen_random_uuid(),$1,$2)',[la,revision])),'CALL NOW cannot claim another brand');
 await commitUser(agentA,sa,'select public.contact_assignment(gen_random_uuid(),$1,$2)',[la,revision]);
 await asUser(agentA,sa,async()=>{
   check((await client.query('select id from public.leads')).rows.length===1,'Agent sees own assigned lead');
   const profiles=(await client.query('select public.get_dashboard_state() x')).rows[0].x.profiles;
   check(profiles.length===1&&profiles[0].id===agentA,'Agent dashboard returns no other profile or performance counters');
 });
 await rejects(()=>asUser(agentA,sa,()=>client.query(`select public.get_agent_performance_report(current_date-7,current_date,null,$1)`,[agentB])),'Cross-agent performance denied');
 await rejects(()=>asUser(adminA,sa,()=>client.query(`select public.get_agent_performance_report(current_date-7,current_date,null,$1)`,[agentB])),'Cross-brand admin agent report filter denied');
 await rejects(()=>asUser(master,sb,()=>client.query(`select public.get_agent_performance_report(current_date-7,current_date,$1)`,[pa])),'Cross-brand Master project report filter denied');
 await asUser(adminA,sa,async()=>{const x=(await client.query('select public.get_agent_performance_report(current_date-7,current_date) x')).rows[0].x;check(x.rows.length===1&&x.rows.every(a=>a.agent_id!==agentB),'Report contains only brand agents');});
 const bulletin=(await commitUser(adminA,sa,`select public.publish_bulletin('Fixture bulletin','Hello') x`)).rows[0].x;
 check(bulletin.recipient_count===1,'General bulletin targets only own brand');
 await asUser(agentB,sb,async()=>{check((await client.query('select public.get_bulletin_feed() x')).rows[0].x.bulletins.length===0,'Other brand cannot read bulletin');});
 await asUser(adminA,null,async()=>{
   check((await client.query(`select leadlaju_private.can_subscribe_brand_topic($1) allowed`,['brand:'+sa+':operations'])).rows[0].allowed,'Realtime own-brand permitted without HTTP selection header');
   check(!(await client.query(`select leadlaju_private.can_subscribe_brand_topic($1) allowed`,['brand:'+sb+':operations'])).rows[0].allowed,'Realtime other-brand denied');
   check(!(await client.query(`select leadlaju_private.can_subscribe_brand_topic('admin:operations') allowed`)).rows[0].allowed,'Legacy global topic denied');
 });
 await asUser(master,null,async()=>{check((await client.query(`select leadlaju_private.can_subscribe_brand_topic($1) allowed`,['brand:'+sb+':operations'])).rows[0].allowed,'Master Realtime works without HTTP selection header');});
 await asUser(adminA,sa,async()=>{
   const rows=(await client.query('select id from public.leads')).rows;check(rows.length===1&&rows[0].id===la,'Direct RLS admin reads own brand only');
   const x=(await client.query('select public.get_dashboard_state() x')).rows[0].x;check(x.leads.length===1&&x.leads[0].id===la,'Legacy definer dashboard scoped');
 });
 await rejects(()=>asUser(adminA,sb,()=>client.query('select public.get_dashboard_state()')),'Forged brand rejected');
 await rejects(()=>asUser(adminA,sa,()=>client.query(`select public.master_manage_brand('list')`)),'Admin cannot list/create brands');
 await rejects(()=>asUser(agentA,sa,()=>client.query(`select public.admin_upsert_project('{"name":"Forbidden"}')`)),'Agent cannot manage projects');
 await rejects(()=>asUser(adminA,sa,()=>client.query('update public.profiles set role=\'master\' where id=$1',[adminA])),'No direct role escalation');
 await rejects(()=>asUser(adminA,sa,()=>client.query('select public.admin_update_lead_details($1,\'x\',\'123\',\'\',\'Same Project\',\'\')',[lb])),'Cross-brand RPC update denied');
 await rejects(()=>client.query('insert into public.agent_project_eligibility(agent_id,project_id,brand_id) values($1,$2,$3)',[agentA,pb,sa]),'Cross-brand relationship rejected');
 await asUser(master,sb,async()=>{const x=(await client.query('select public.get_dashboard_state() x')).rows[0].x;check(x.leads.length===1&&x.leads[0].id===lb,'Master selects one brand');});
 await asUser(master,null,async()=>{check((await client.query(`select public.master_manage_brand('list') x`)).rows[0].x.brands.length===2,'Master lists all brands');});
 await commitUser(master,sb,`select public.master_manage_brand('set_active',$1)`,[{id:sb,active:false,confirmation:sb}]);
 check((await client.query('select lead_ready from public.agent_availability where agent_id=$1',[agentB])).rows[0].lead_ready===false,'Suspension resets GET LEAD');
 check((await client.query('select user_id from public.claim_notification_outbox(100)')).rows.every(x=>x.user_id!==agentB),'Suspension excludes push worker claims');
 await asUser(adminB,null,async()=>{const rows=(await client.query('select * from public.leads')).rows;check(rows.length===0,'Suspended brand data blocked');});
 await rejects(()=>asUser(adminB,null,()=>client.query(`select public.admin_upsert_project('{"name":"Blocked"}')`)),'Suspended brand write blocked');
 const before=(await client.query('select queue_cycle from public.dispatch_state where brand_id=$1',[sb])).rows[0].queue_cycle;
 await client.query(`select leadlaju_private.expire_assignments(now())`);
 check((await client.query('select queue_cycle from public.dispatch_state where brand_id=$1',[sb])).rows[0].queue_cycle===before,'Scheduler skips suspended brand');
 check((await client.query("select count(*)::int n from public.master_audit_log where action in ('master_bootstrap','brand_set_active')")).rows[0].n===2,'Master actions audited');
 await commitUser(master,sb,`select public.master_manage_brand('set_active',$1)`,[{id:sb,active:true,confirmation:sb}]);
 check((await client.query('select lead_ready from public.agent_availability where agent_id=$1',[agentB])).rows[0].lead_ready===false,'Reactivation requires GET LEAD again');
 await asUser(adminB,sb,async()=>{check((await client.query('select id from public.leads')).rows[0].id===lb,'Reactivation retains historical records');});
 await commitUser(master,sa,`select public.admin_upsert_project('{"name":"Master Audit Project"}')`);
 check((await client.query("select count(*)::int n from public.master_audit_log where action='operation_insert' and details->>'table'='projects'")).rows[0].n===1,'Master legacy operational RPC audited');
 await client.query("insert into realtime.messages(topic,extension) values('fixture','broadcast')");
 await asUser(adminA,sa,async()=>{
   await client.query("select set_config('realtime.topic',$1,true)",['brand:'+sb+':operations']);
   check((await client.query('select * from realtime.messages')).rows.length===0,'Actual Realtime RLS denies another brand channel');
   await client.query("select set_config('realtime.topic',$1,true)",['brand:'+sa+':operations']);
   check((await client.query('select * from realtime.messages')).rows.length===1,'Actual Realtime RLS permits own brand channel');
 });
 for(const b of [sa,sb]) {
   await client.query('begin');
   try {
     await client.query(`select set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('request.headers',$1,true)`,[JSON.stringify({'x-leadlaju-brand':b})]);
     await client.query('set local role service_role');
     const sql=`select public.ingest_lead('meta_ads:same-id','meta_ads','same-id','Test','60120000000','','','Same Project','Meta Ads','',now(),'hash') x`;
     const first=(await client.query(sql)).rows[0].x;
     const second=(await client.query(sql)).rows[0].x;
     check(first.result==='inserted' && second.result==='duplicate','Service-role ingestion is idempotent per brand');
     check((await client.query('select brand_id from public.leads where id=$1',[first.lead_id])).rows[0].brand_id===b,'Service ingestion targets resolved brand');
   } finally {await client.query('rollback');}
 }
 for(const [id,b,lead] of [[agentA,sa,la],[agentB,sb,lb]]) {
   await client.query(`insert into public.appointments(brand_id,lead_id,type,scheduled_at,status,assigned_agent_id,source_appointment_id) values($1,$2,'Viewing',now()-interval '3 hours','scheduled',$3,'same-appointment-source')`,[b,lead,id]);
 }
 for(let hour=0;hour<6;hour++) await client.query(`select leadlaju_private.process_appointment_outcomes(now()+$1*interval '1 hour')`,[hour]);
 check((await client.query("select count(*)::int n from public.appointments where status='scheduled' and reminder_state->>'outcome_count'='6'")).rows[0].n===2,'Six hourly appointment reminders preserved in both brands');
 check((await client.query("select count(*)::int n from public.notification_outbox where dedupe_key like 'appointment-outcome:%'")).rows[0].n===12,'Appointment reminders isolated and not duplicated');
 await client.query("select leadlaju_private.process_appointment_outcomes(now()+interval '6 hours')");
 check((await client.query("select count(*)::int n from public.appointments where status='show_up'")).rows[0].n===2,'Original automatic Show Up rule preserved per brand');
 // Team Sales remains a separate mode; all legacy assertions above still run.
 await rejects(()=>commitUser(master,sa,`select public.master_manage_brand('create','{"name":"No Mode","slug":"no-mode"}')`),'Master must choose a mode');
 const sales=(await commitUser(master,sa,`select public.master_manage_brand('create','{"name":"Sales","slug":"sales","distribution_mode":"team_sales"}') x`)).rows[0].x.brand.id;
 await rejects(()=>commitUser(master,sa,`select public.master_manage_brand('update',$1)`,[{id:sales,name:'Sales',distribution_mode:'agent'}]),'Even Master cannot change mode');
 await rejects(()=>client.query(`update public.brands set distribution_mode='team_sales' where id=$1`,[sa]),'Safrich mode immutable');
 const salesAdmin='30000000-0000-4000-8000-000000000001';
 const members=[2,3,4].map(n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
 for(const id of [salesAdmin,...members]) {
   await client.query(`insert into auth.users(id,email) values($1::uuid,$1::text||'@sales.test')`,[id]);
   await client.query(`insert into public.profiles(id,name,email,role,approval_status,active,brand_id) values($1::uuid,'Sales Fixture',$1::text||'@sales.test',$2,'approved',true,$3)`,[id,id===salesAdmin?'admin':'agent',sales]);
 }
 const salesProject=(await commitUser(salesAdmin,sales,`select public.admin_upsert_project('{"name":"Same Project"}') x`)).rows[0].x.project.id;
 const saleIngest=n=>commitUser(salesAdmin,sales,`select public.admin_ingest_manual_lead($1) x`,[{id:`sales-${n}`,name:`Sales ${n}`,phone:'60120000000',project:'Same Project'}]);
 const firstSale=(await saleIngest(1)).rows[0].x.lead_id;
 check((await client.query('select assigned_agent_id from public.leads where id=$1',[firstSale])).rows[0].assigned_agent_id===null,'No eligible recipient leaves New queued');
 await client.query('begin');
 for(const id of members) await client.query(`insert into public.agent_project_eligibility(brand_id,agent_id,project_id) values($1,$2,$3)`,[sales,id,salesProject]);
 await client.query('commit');
 check((await client.query('select queue_state from public.leads where id=$1',[firstSale])).rows[0].queue_state==='sales_assigned','Eligibility insertion automatically drains backlog');
 for(let n=2;n<=7;n++) await saleIngest(n);
 const distribution=(await client.query(`select assigned_agent_id,count(*)::int n from public.leads where brand_id=$1 group by assigned_agent_id order by assigned_agent_id`,[sales])).rows;
 check(distribution.map(x=>x.n).join('/')==='3/2/2','Seven leads distribute 3/2/2 while all accounts offline');
 check((await client.query(`select count(*)::int n from public.lead_assignments where brand_id=$1 and assignment_mode='team_sales' and expires_at is null and outcome='pending'`,[sales])).rows[0].n===7,'Multiple pending no-expiry assignments allowed');
 const cursorBefore=(await client.query('select sales_last_agent_id from public.project_dispatch_state where project_id=$1',[salesProject])).rows[0].sales_last_agent_id;
 await saleIngest(1);
 check((await client.query('select sales_last_agent_id from public.project_dispatch_state where project_id=$1',[salesProject])).rows[0].sales_last_agent_id===cursorBefore,'Duplicate ingestion does not advance cursor');
 await client.query(`select leadlaju_private.expire_assignments(now()+interval '2 days')`);
 check((await client.query(`select count(*)::int n from public.leads where brand_id=$1 and status='new' and queue_state='sales_assigned'`,[sales])).rows[0].n===7,'Team Sales never expires or becomes missed');
 const sale=(await client.query('select * from public.leads where id=$1',[firstSale])).rows[0];
 await rejects(()=>commitUser(agentA,sa,`select public.team_sales_contact($1,'call',gen_random_uuid(),$2)`,[sale.id,sale.assignment_revision]),'Safrich cannot call Team Sales RPC');
 await rejects(()=>commitUser(members.find(id=>id!==sale.assigned_agent_id),sales,`select public.team_sales_contact($1,'call',gen_random_uuid(),$2)`,[sale.id,sale.assignment_revision]),'Another owner cannot claim lead');
 await rejects(()=>commitUser(sale.assigned_agent_id,sales,`select public.contact_assignment(gen_random_uuid(),$1,$2)`,[sale.id,sale.assignment_revision]),'Team Sales cannot use CALL NOW');
 const action='40000000-0000-4000-8000-000000000001';
 await rejects(()=>commitUser(sale.assigned_agent_id,sales,`select public.team_sales_contact($1,null,gen_random_uuid(),$2)`,[sale.id,sale.assignment_revision]),'Missing channel denied');
 await rejects(()=>commitUser(sale.assigned_agent_id,sales,`select public.team_sales_contact($1,'call',gen_random_uuid(),null)`,[sale.id]),'Missing revision denied');
 await commitUser(sale.assigned_agent_id,sales,`select public.team_sales_contact($1,'whatsapp',$2,$3)`,[sale.id,action,sale.assignment_revision]);
 await commitUser(sale.assigned_agent_id,sales,`select public.team_sales_contact($1,'whatsapp',$2,$3)`,[sale.id,action,sale.assignment_revision]);
 check((await client.query(`select count(*)::int n from public.lead_events where lead_id=$1 and event_type='sales_contact'`,[sale.id])).rows[0].n===1,'Repeated action records once');
 check((await client.query('select status,follow_up_count from public.leads where id=$1',[sale.id])).rows[0].follow_up_count===0,'Ordinary WhatsApp does not increment Follow Up');
 await client.query(`update public.leads set status='potential',queue_state='potential' where id=$1`,[sale.id]);
 await commitUser(sale.assigned_agent_id,sales,`select public.team_sales_contact($1,'call',gen_random_uuid(),$2)`,[sale.id,sale.assignment_revision]);
 check((await client.query('select status from public.leads where id=$1',[sale.id])).rows[0].status==='potential','Call does not overwrite a later status');
 await asUser(salesAdmin,sales,async()=>{
   const report=(await client.query('select public.get_agent_performance_report(current_date-7,current_date) x')).rows[0].x;
   check(report.response_sla_applicable===false&&report.rows.every(r=>!Object.hasOwn(r,'within_five')),'Team Sales report omits 5-minute measurement');
   check(report.rows.reduce((n,r)=>n+r.assignments,0)===7,'Team Sales report counts assignments');
 });
 const concurrentProject=(await commitUser(salesAdmin,sales,`select public.admin_upsert_project('{"name":"Concurrent Project"}') x`)).rows[0].x.project.id;
 for(const id of members) await client.query('insert into public.agent_project_eligibility(brand_id,agent_id,project_id) values($1,$2,$3)',[sales,id,concurrentProject]);
 await Promise.all([1,2,3,4,5,6,7,1,2].map(async n=>{
   const connection=pg.getPgClient();await connection.connect();
   try {
     await connection.query('begin');
     await connection.query(`select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)`,[JSON.stringify({sub:salesAdmin,role:'authenticated'}),JSON.stringify({'x-leadlaju-brand':sales})]);
     await connection.query('set local role authenticated');
     await connection.query('select public.admin_ingest_manual_lead($1)',[{id:`concurrent-${n}`,name:'Concurrent fixture',phone:'60120000000',project:'Concurrent Project'}]);
     await connection.query('commit');
   } catch(error) {await connection.query('rollback');throw error;} finally {await connection.end();}
 }));
 const parallel=(await client.query('select assigned_agent_id,count(*)::int n from public.leads where project_id=$1 group by assigned_agent_id order by assigned_agent_id',[concurrentProject])).rows;
 check(parallel.map(x=>x.n).sort().join('/')==='2/2/3','Concurrent ingestion and duplicates distribute exactly 3/2/2');
 check((await client.query('select count(*)::int n from public.lead_assignments a join public.leads l on l.id=a.lead_id where l.project_id=$1',[concurrentProject])).rows[0].n===7,'Concurrent duplicate ingestion creates exactly seven assignments');
 await client.query('update public.profiles set active=false where id=$1',[sale.assigned_agent_id]);
 check((await client.query('select assigned_agent_id from public.leads where id=$1',[sale.id])).rows[0].assigned_agent_id===sale.assigned_agent_id,'Deactivation preserves ownership');
 await rejects(()=>commitUser(sale.assigned_agent_id,sales,`select public.team_sales_contact($1,'call',gen_random_uuid(),$2)`,[sale.id,sale.assignment_revision]),'Inactive account cannot act');
 await client.query('update public.profiles set active=false where id=any($1::uuid[])',[members]);
 const waiting=(await saleIngest(8)).rows[0].x.lead_id;
 check((await client.query('select assigned_agent_id from public.leads where id=$1',[waiting])).rows[0].assigned_agent_id===null,'All inactive members leave new lead waiting');
 await client.query('update public.profiles set active=true where id=$1',[members[0]]);
 check((await client.query('select assigned_agent_id from public.leads where id=$1',[waiting])).rows[0].assigned_agent_id===members[0],'Reactivation automatically assigns backlog without GET LEAD');
 await client.query('update public.brands set active=false where id=$1',[sales]);
 await client.query(`insert into public.leads(brand_id,name,phone,project_id,source,source_lead_id,ingestion_fingerprint,created_at) values($1,'Recovery fixture','60120000000',$2,'manual','recovery','recovery-fixture',now())`,[sales,salesProject]);
 await client.query('update public.brands set active=true where id=$1',[sales]);
 check((await client.query('select leadlaju_private.recover_team_sales_dispatch() n')).rows[0].n===1,'Dedicated scheduler recovers backlog after brand reactivation');
 check((await client.query("select count(*)::int n from cron.job where jobname='leadlaju-team-sales-dispatch' and schedule='* * * * *'")).rows[0].n===1,'Team Sales recovery job is scheduled');
 await rejects(()=>asUser(salesAdmin,sales,()=>client.query('select leadlaju_private.recover_team_sales_dispatch()')),'Public accounts cannot run global recovery');
 console.log(`PASS: ${checks} real PostgreSQL brand isolation and distribution assertions`);
} finally { if(client) await client.end(); await pg.stop(); }
