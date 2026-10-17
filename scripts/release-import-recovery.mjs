import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const version='20261017141641';
const source=fs.readFileSync(`supabase/migrations/${version}_defer_bulk_import_dispatch.sql`,'utf8');
const query=sql=>JSON.parse(execFileSync('npx',['supabase','db','query','--linked','--project-ref','zvplvrtqvsfrftnjfdsh','--output','json','--',sql],{encoding:'utf8',maxBuffer:32*1024*1024})).rows;
if(!process.argv.includes('--apply')) throw Error('Use --apply for approved production release');
const snapshot=query(`select pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ingest_lead';`);
const directory=fs.mkdtempSync('/tmp/leadlaju-import-backup-');fs.chmodSync(directory,0o700);
fs.writeFileSync(`${directory}/snapshot.json`,JSON.stringify(snapshot),{mode:0o600});
console.log({backup:directory});
console.log(query(`begin; set local lock_timeout='10s'; set local statement_timeout='60s';
${source}
insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','defer_bulk_import_dispatch',array[$migration$${source}$migration$]);
commit;
select to_regclass('leadlaju_private.import_dispatch_pending') is not null queue_ready,
exists(select 1 from cron.job where jobname='leadlaju-import-dispatch' and active) worker_ready;`));
