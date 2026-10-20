// Explicit release only. Back up and verify every initial deletion batch first.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const query=sql=>{
 const file=path.join(process.env.LEADLAJU_LOG_BACKUP_DIR,'operator-query.sql');
 fs.writeFileSync(file,sql,{mode:0o600});
 return JSON.parse(execFileSync('npx',['supabase','db','query','--linked','--project-ref','zvplvrtqvsfrftnjfdsh','--output','json','--file',file],{encoding:'utf8',maxBuffer:128*1024*1024,timeout:30000})).rows;
};
if(!process.argv.includes('--apply')) throw Error('Use --apply only for approved release');
const destination=process.env.LEADLAJU_LOG_BACKUP_DIR;
if(!destination || !path.isAbsolute(destination) || !fs.statSync(destination).isDirectory()) throw Error('Set LEADLAJU_LOG_BACKUP_DIR to an existing private durable backup directory');
fs.writeFileSync(path.join(destination,'retention-before.json'),JSON.stringify(query("select pg_get_functiondef('leadlaju_private.prune_completed_cron_logs()'::regprocedure) as function_definition,(select row_to_json(j) from cron.job j where jobname='leadlaju-cron-log-retention') as job")),{mode:0o600,flag:'wx'});
const snapshot=query('select now() as cutoff,(select max(runid) from cron.job_run_details) as high_water')[0];
const cutoff=snapshot.cutoff;
const highWater=String(snapshot.high_water || '0');
if(!/^\d+$/.test(highWater))throw Error('Invalid snapshot cursor');
const eligible=`end_time is not null and ((status='succeeded' and end_time<'${cutoff}'::timestamptz-interval '7 days') or (status='failed' and end_time<'${cutoff}'::timestamptz-interval '30 days'))`;
const cutoffTime=Date.parse(cutoff);
let after='0',batches=0,deleted=0;
while(true){
 // Bound the PK page before filtering; advance even when nothing is eligible.
 const page=query(`select * from cron.job_run_details where runid>${after} and runid<=${highWater} order by runid limit 2000;`);
 if(!page.length)break;
 const next=String(page.at(-1).runid);
 if(!/^\d+$/.test(next))throw Error('Invalid page cursor');
 const rows=page.filter(row=>row.end_time && ((row.status==='succeeded' && Date.parse(row.end_time)<cutoffTime-7*86400000) || (row.status==='failed' && Date.parse(row.end_time)<cutoffTime-30*86400000)));
 if(!rows.length){after=next;continue;}
 const ids=rows.map(r=>String(r.runid));if(ids.some(id=>!/^\d+$/.test(id)))throw Error('Invalid run ID');
 const file=path.join(destination,`cron-${ids[0]}-${ids.at(-1)}.json.gz`);
 fs.writeFileSync(file,gzipSync(JSON.stringify(rows)),{mode:0o600,flag:'wx'});
 const restored=JSON.parse(gunzipSync(fs.readFileSync(file)).toString());
 if(JSON.stringify(restored)!==JSON.stringify(rows))throw Error('Backup verification failed');
 const chunks=[];
 for(let i=0;i<ids.length;i+=1000) chunks.push(ids.slice(i,i+1000));
 const result=query(`create temporary table retention_deleted(n bigint);${chunks.map(chunk=>`begin;set local lock_timeout='1s';set local statement_timeout='5s';with removed as (delete from cron.job_run_details where runid in (${chunk.join(',')}) and (${eligible}) returning runid) insert into retention_deleted select count(*) from removed;commit;`).join('\n')}select sum(n) count from retention_deleted;`);
 deleted+=Number(result[0]?.count||0);batches++;after=next;
 console.log(JSON.stringify({batches,backedUpThrough:after,deleted}));
 await new Promise(r=>setTimeout(r,100));
}
const migration=fs.readFileSync('supabase/migrations/20261018172414_safe_cron_log_retention.sql','utf8');
const installed=query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261018172414') installed")[0].installed;
const optimized=fs.readFileSync('supabase/migrations/20261020152610_optimize_cron_retention_batches.sql','utf8');
const optimizedInstalled=query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261020152610') installed")[0].installed;
// One bounded batch per minute replaces 100 repeated scans once daily.
const boundedSweep="set lock_timeout='1s';set statement_timeout='5s';select leadlaju_private.prune_completed_cron_logs();";
query(`begin;${installed ? '' : migration}
${optimizedInstalled ? '' : optimized}
select cron.schedule('leadlaju-cron-log-retention','* * * * *',$sweep$${boundedSweep}$sweep$);
insert into supabase_migrations.schema_migrations(version,name,statements) values('20261018172414','safe_cron_log_retention',array[$migration$${migration}$migration$]) on conflict(version) do nothing;
insert into supabase_migrations.schema_migrations(version,name,statements) values('20261020152610','optimize_cron_retention_batches',array[$migration$${optimized}$migration$]) on conflict(version) do nothing;commit;`);
// No forced vacuum on a loaded instance; normal autovacuum remains enabled.
console.log({backupDirectory:destination,batches,deleted});
