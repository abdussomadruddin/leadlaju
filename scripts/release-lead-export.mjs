import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const version='20261018155156';
const source=fs.readFileSync(`supabase/migrations/${version}_admin_lead_excel_export.sql`,'utf8');
const query=sql=>JSON.parse(execFileSync('npx',['supabase','db','query','--linked','--project-ref','zvplvrtqvsfrftnjfdsh','--output','json','--',sql],{encoding:'utf8',maxBuffer:8*1024*1024})).rows;
if(!process.argv.includes('--apply')) throw Error('Use --apply for approved production release');
const snapshot=query(`select to_regprocedure('public.export_brand_leads_page(uuid,timestamptz)')::text existing_function,
 (select count(*) from public.leads) lead_count,
 (select has_schema_privilege('leadlaju_tenant_executor','public','CREATE')) tenant_schema_create;`);
if(snapshot[0].existing_function) throw Error('Export endpoint already exists; inspect before retrying');
const directory=fs.mkdtempSync('/tmp/leadlaju-export-backup-');fs.chmodSync(directory,0o700);
fs.writeFileSync(`${directory}/snapshot.json`,JSON.stringify(snapshot),{mode:0o600});
console.log({backup:directory});
console.log(query(`begin;set local lock_timeout='10s';set local statement_timeout='60s';
${source}
insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','admin_lead_excel_export',array[$migration$${source}$migration$]);
notify pgrst,'reload schema';commit;
select to_regprocedure('public.export_brand_leads_page(uuid,timestamptz)')::text endpoint,
 has_function_privilege('anon','public.export_brand_leads_page(uuid,timestamptz)','EXECUTE') anon_access,
 has_function_privilege('authenticated','public.export_brand_leads_page(uuid,timestamptz)','EXECUTE') authenticated_access,
 (select rolbypassrls from pg_roles where rolname='leadlaju_tenant_executor') owner_bypasses_rls;`));
