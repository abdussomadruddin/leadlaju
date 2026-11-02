// Read-only release preflight. No migration, retraction, assignment or deployment.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
if(!process.argv.includes('--backup'))throw Error('Use --backup for a private read-only preflight');
const dir=fs.mkdtempSync(path.join(os.homedir(),'LeadLaju-neglect-days-backup-'));fs.chmodSync(dir,0o700);
function query(sql){const file=path.join(dir,'read-only-query.sql');fs.writeFileSync(file,sql,{mode:0o600});const raw=JSON.parse(execFileSync('npx',['supabase','db','query','--linked','--project-ref','zvplvrtqvsfrftnjfdsh','--output','json','--file',file],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:30000}));return raw.rows||raw;}
const metadata=query(`select jsonb_build_object('captured_at',now(),
 'brands',(select jsonb_agg(jsonb_build_object('id',b.id,'active',b.active,'mode',b.distribution_mode,'neglect_days',to_jsonb(b)->'neglect_days')) from public.brands b),
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='leadlaju_private' and p.proname in('track_neglect_activity','retract_neglected_brand')),
 'indexes',(select jsonb_agg(to_jsonb(i)) from pg_indexes i where schemaname='public' and tablename='leads'),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in('brands','master_audit_log')),
 'triggers',(select jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled)) from pg_trigger where tgrelid='public.leads'::regclass and not tgisinternal)) snapshot;`)[0]?.snapshot;
if(!metadata?.functions||!metadata.brands)throw Error('Incomplete metadata backup');
fs.writeFileSync(path.join(dir,'metadata.json'),JSON.stringify(metadata,null,2),{mode:0o600});
const file=path.join(dir,'lead-clocks.jsonl');fs.writeFileSync(file,'',{mode:0o600});let after=null,rows=0;
while(true){
 const page=query(`select l.id,l.brand_id,l.assigned_agent_id,l.assignment_revision,l.status_revision,l.neglect_activity_at,to_jsonb(l)->'neglect_due_at' neglect_due_at from public.leads l join public.brands b on b.id=l.brand_id where b.distribution_mode='agent' and l.status='contacted' and l.assigned_agent_id is not null and not l.neglected_held ${after?`and l.id>'${after}'::uuid`:''} order by l.id limit 500;`);
 if(!page.length)break;
 const next=String(page.at(-1).id);if(!/^[0-9a-f-]{36}$/i.test(next)||next===after)throw Error('Invalid page cursor');
 fs.appendFileSync(file,page.map(x=>JSON.stringify(x)).join('\n')+'\n');rows+=page.length;after=next;
}
const bytes=fs.readFileSync(file);const restored=bytes.toString().trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));
if(restored.length!==rows||restored.some(x=>!x.id||!x.brand_id))throw Error('Clock backup validation failed');
fs.writeFileSync(path.join(dir,'complete.json'),JSON.stringify({rows,started_at:metadata.captured_at,finished_at:new Date().toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),missingActivity:restored.filter(x=>!x.neglect_activity_at).length,productionChanged:false}),{mode:0o600});
console.log(JSON.stringify({backup:dir,clockRecords:rows,missingActivity:restored.filter(x=>!x.neglect_activity_at).length,verified:true,productionChanged:false}));
