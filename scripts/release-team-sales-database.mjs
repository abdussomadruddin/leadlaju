// Trusted operator release; never print credentials or lead records.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const ref='zvplvrtqvsfrftnjfdsh';
if(fs.readFileSync(path.join(root,'supabase/.temp/project-ref'),'utf8').trim()!==ref)throw new Error('Wrong project');
const backup=process.argv.find(arg=>arg.startsWith('--backup='))?.slice(9);
if(!process.argv.includes('--apply')||!backup||!fs.statSync(path.join(backup,'database-before-brands.dump')).size)throw new Error('Require --apply and verified --backup directory');
const query=sql=>{
 try{return execFileSync('npx',['supabase','db','query','--linked','--project-ref',ref,sql,'--output','json'],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});}
 catch(error){throw new Error(String(error.stderr||'Database release failed').slice(-1500));}
};
const files=['20261001022101_team_sales_queue_state.sql','20261001022355_team_sales_distribution_modes.sql'];
const enumSource=fs.readFileSync(path.join(root,'supabase/migrations',files[0]),'utf8');
query(`begin; ${enumSource} insert into supabase_migrations.schema_migrations(version,name,statements) values('20261001022101','team_sales_queue_state',array[$source$${enumSource}$source$]) on conflict(version) do nothing; commit;`);
const source=fs.readFileSync(path.join(root,'supabase/migrations',files[1]),'utf8');
const sql=`begin;
set local lock_timeout='15s';set local statement_timeout='120s';
do $$ declare r record;begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='brands' and column_name='distribution_mode') then raise exception 'Mode migration already installed';end if;
 for r in select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name loop execute format('lock table public.%I in access exclusive mode',r.table_name);end loop;
end $$;
create temporary table preserved_safrich(table_name text,n bigint,fingerprint text);
do $$ declare r record;n bigint;fingerprint text;begin
 for r in select table_name from information_schema.columns where table_schema='public' and column_name='brand_id' order by table_name loop
   execute format('select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from public.%I t where brand_id=%L',r.table_name,'00000000-0000-4000-8000-000000000001') into n,fingerprint;
   insert into preserved_safrich values(r.table_name,n,fingerprint);
 end loop;
end $$;
create temporary table preserved_algorithms as select proname,prosrc from pg_proc where oid in ('leadlaju_private.dispatch_available_leads_brand(timestamptz)'::regprocedure,'leadlaju_private.expire_assignments_brand(timestamptz)'::regprocedure);
${source}
do $$ declare r record;n bigint;fingerprint text;body text;begin
 for r in select * from preserved_safrich loop
   execute format('select count(*),md5(coalesce(string_agg((to_jsonb(t)-''assignment_mode''-''sales_last_agent_id'')::text,''|'' order by (to_jsonb(t)-''assignment_mode''-''sales_last_agent_id'')::text),'''')) from public.%I t where brand_id=%L',r.table_name,'00000000-0000-4000-8000-000000000001') into n,fingerprint;
   if n<>r.n or fingerprint<>r.fingerprint then raise exception 'Safrich records changed in %',r.table_name;end if;
 end loop;
 if exists(select 1 from public.brands where distribution_mode<>'agent') then raise exception 'Existing brand mode changed';end if;
 for r in select * from preserved_algorithms loop
   select prosrc into body from pg_proc where oid=to_regprocedure('leadlaju_private.'||replace(r.proname,'_brand','_agent_brand')||'(timestamptz)');
   if body is distinct from r.prosrc then raise exception 'Legacy algorithm changed: %',r.proname;end if;
 end loop;
end $$;
insert into supabase_migrations.schema_migrations(version,name,statements) values('20261001022355','team_sales_distribution_modes',array[$source$${source}$source$]);
commit;
select 'Team Sales migration committed; Safrich counts, record fingerprints and Ejen algorithms preserved' as result;`;
console.log(query(sql));
