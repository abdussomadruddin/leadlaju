// Apply only this migration atomically without repairing unrelated historical
// migration records (the legacy database has additional dashboard migrations).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const ref='zvplvrtqvsfrftnjfdsh';
if(fs.readFileSync(path.join(root,'supabase/.temp/project-ref'),'utf8').trim()!==ref) throw new Error('Wrong linked project');
if(!process.argv.includes('--apply')) throw new Error('Explicit --apply is required after backup and tests');
const file='20260930174735_master_brand_isolation.sql';
const source=fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8');
const sql=`begin;
set local lock_timeout='15s'; set local statement_timeout='120s';
do $$ begin if to_regclass('public.brands') is not null then raise exception 'Brand migration already installed'; end if; end $$;
create temporary table brand_release_counts as select table_name,(xpath('/row/c/text()',query_to_xml(format('select count(*) c from public.%I',table_name),false,true,'')))[1]::text::bigint n from information_schema.tables where table_schema='public' and table_type='BASE TABLE';
${source}
do $$ declare r record; n bigint; begin for r in select * from brand_release_counts loop
 execute format('select count(*) from public.%I',r.table_name) into n;
 if n<>r.n then raise exception 'Backfill changed record count for %',r.table_name; end if;
 end loop; end $$;
insert into supabase_migrations.schema_migrations(version,name,statements) values('20260930174735','master_brand_isolation',array[$migration$${source}$migration$]);
commit;
select 'Brand migration committed; all existing table counts preserved' as result;`;
const result=execFileSync('npx',['supabase','db','query','--linked','--project-ref',ref,sql,'--output','json'],{encoding:'utf8',maxBuffer:1024*1024,cwd:root});
console.log(result);
