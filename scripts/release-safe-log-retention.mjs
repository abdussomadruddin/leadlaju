// Explicit release only. Back up and verify every initial deletion batch first.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const query=sql=>JSON.parse(execFileSync('npx',['supabase','db','query','--linked','--project-ref','zvplvrtqvsfrftnjfdsh','--output','json','--',sql],{encoding:'utf8',maxBuffer:32*1024*1024})).rows;
if(!process.argv.includes('--apply')) throw Error('Use --apply only for approved release');
const destination=process.env.LEADLAJU_LOG_BACKUP_DIR;
if(!destination || !path.isAbsolute(destination) || !fs.statSync(destination).isDirectory()) throw Error('Set LEADLAJU_LOG_BACKUP_DIR to an existing private durable backup directory');
const cutoff=query('select now() as cutoff')[0].cutoff;
const eligible=`end_time is not null and ((status='succeeded' and end_time<'${cutoff}'::timestamptz-interval '7 days') or (status='failed' and end_time<'${cutoff}'::timestamptz-interval '30 days'))`;
let after='0',batches=0,deleted=0;
while(true){
 const rows=query(`select * from cron.job_run_details where runid>${after} and (${eligible}) order by runid limit 1000;`);
 if(!rows.length)break;
 const ids=rows.map(r=>String(r.runid));if(ids.some(id=>!/^\d+$/.test(id)))throw Error('Invalid run ID');
 const file=path.join(destination,`cron-${ids[0]}-${ids.at(-1)}.json.gz`);
 fs.writeFileSync(file,gzipSync(JSON.stringify(rows)),{mode:0o600,flag:'wx'});
 const restored=JSON.parse(gunzipSync(fs.readFileSync(file)).toString());
 if(JSON.stringify(restored)!==JSON.stringify(rows))throw Error('Backup verification failed');
 const result=query(`begin;set local lock_timeout='1s';set local statement_timeout='5s';with removed as (delete from cron.job_run_details where runid in (${ids.join(',')}) and (${eligible}) returning runid) select count(*) count from removed;commit;`);
 deleted+=Number(result[0]?.count||0);batches++;after=ids.at(-1);
 await new Promise(r=>setTimeout(r,100));
}
const migration=fs.readFileSync('supabase/migrations/20261018172414_safe_cron_log_retention.sql','utf8');
const installed=query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261018172414') installed")[0].installed;
query(`begin;${installed ? '' : migration}
select cron.schedule('leadlaju-cron-log-retention','17 19 * * *','select leadlaju_private.prune_completed_cron_logs()');
insert into supabase_migrations.schema_migrations(version,name,statements) values('20261018172414','safe_cron_log_retention',array[$migration$${migration}$migration$]) on conflict(version) do nothing;commit;`);
query('vacuum cron.job_run_details;');
console.log({backupDirectory:destination,batches,deleted});
