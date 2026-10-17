import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const ref='zvplvrtqvsfrftnjfdsh';
const file='20261010161039_eligible_fresh_retry_dispatch.sql';
const source=fs.readFileSync(`supabase/migrations/${file}`,'utf8');
const query=sql=>JSON.parse(execFileSync('npx',['supabase','db','query','--linked','--project-ref',ref,sql,'--output','json'],{encoding:'utf8',maxBuffer:4*1024*1024})).rows;
const before=query(`select pg_get_functiondef(p.oid) definition,r.rolname owner,p.proacl::text acl from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='leadlaju_private.dispatch_available_leads_agent_brand(timestamptz)'::regprocedure`)[0];
const backup=fs.mkdtempSync('/tmp/leadlaju-retry-backup-');
fs.writeFileSync(`${backup}/function.json`,JSON.stringify(before),{mode:0o600});
const verification=`do $check$ begin
 if position('p.brand_id = fresh.brand_id' in pg_get_functiondef('leadlaju_private.dispatch_available_leads_agent_brand(timestamptz)'::regprocedure))=0 then raise exception 'Guard missing';end if;
 if (select r.rolname from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='leadlaju_private.dispatch_available_leads_agent_brand(timestamptz)'::regprocedure)<>'leadlaju_tenant_executor' then raise exception 'Wrong owner';end if;
 if has_function_privilege('authenticated','leadlaju_private.dispatch_available_leads_agent_brand(timestamptz)','execute') then raise exception 'Public access';end if;
end $check$;`;
console.log(JSON.stringify({backup,dryRun:query(`begin;set local lock_timeout='10s';${source}\n${verification}\nrollback;select 'dry run passed' result;`)}));
if(process.argv.includes('--apply'))console.log(JSON.stringify(query(`begin;set local lock_timeout='10s';${source}\n${verification}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('20261010161039','eligible_fresh_retry_dispatch',array[$source$${source}$source$]) on conflict(version) do nothing;commit;select 'Queue fix deployed' result;`)));
