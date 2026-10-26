// Read-only production preflight. Does NOT migrate, retract, assign or deploy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
if (!process.argv.includes('--backup')) throw new Error('Use --backup for read-only preflight and private local backup');
const sql = `select jsonb_build_object('captured_at',now(),'leads',coalesce((select jsonb_agg(to_jsonb(l)) from public.leads l join public.brands b on b.id=l.brand_id where b.active and b.distribution_mode='agent' and l.status='contacted' and l.assigned_agent_id is not null),'[]'),
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','leadlaju_private') and p.prokind='f'),
 'indexes',(select jsonb_agg(to_jsonb(i)) from pg_indexes i where schemaname='public' and tablename in ('leads','lead_assignments'))) snapshot;`;
const raw=execFileSync('npx',['supabase','db','query','--linked','--project-ref','zvplvrtqvsfrftnjfdsh','--output','json','--',sql],{encoding:'utf8',maxBuffer:128*1024*1024});
const result=JSON.parse(raw); const snapshot=(result.rows || result)[0]?.snapshot;
if(!snapshot?.leads || !snapshot.functions) throw new Error('Incomplete backup response');
const dir=fs.mkdtempSync(path.join(os.homedir(),'LeadLaju-neglected-backup-'));fs.chmodSync(dir,0o700);
fs.writeFileSync(path.join(dir,'snapshot.json'),JSON.stringify(snapshot),{mode:0o600});
const captured=Date.parse(snapshot.captured_at),counts={};let missing=0;
for(const lead of snapshot.leads){
 const activity=lead.follow_up_activity_at || lead.contacted_at || lead.status_updated_at;
 if(!lead.follow_up_activity_at)missing++;
 if(activity && Date.parse(activity)<=captured-120*3600000)counts[lead.brand_id]=(counts[lead.brand_id]||0)+1;
}
console.log(JSON.stringify({backup:dir,contacted:snapshot.leads.length,eligibleByBrand:counts,missingActivityRequiringReview:missing,productionChanged:false}));
