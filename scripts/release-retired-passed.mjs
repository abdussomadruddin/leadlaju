// Scoped, history-preserving production migration with a verified private backup.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const ref='zvplvrtqvsfrftnjfdsh';
if(fs.readFileSync('supabase/.temp/project-ref','utf8').trim()!==ref)throw new Error('Wrong project');
const backup=process.argv.find(arg=>arg.startsWith('--backup='))?.slice(9);
if(!backup||!fs.statSync(`${backup}/operational-data-and-functions.json`).size)throw new Error('Verified backup required');
const file=fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_merge_passed_into_rejected.sql'));
const version=file.split('_')[0],source=fs.readFileSync(`supabase/migrations/${file}`,'utf8');
const sql=`begin;set local lock_timeout='15s';set local statement_timeout='120s';
lock table public.leads,public.lead_assignments,public.lead_events in share row exclusive mode;
create temporary table preserved_leads as select * from public.leads;
create temporary table preserved_assignments as select * from public.lead_assignments;
create temporary table preserved_events as select * from public.lead_events;
${source}
do $$begin
if exists(select 1 from preserved_leads old full join public.leads new using(id)
where old.id is null or new.id is null or
(old.status<>'passed' and to_jsonb(old)<>to_jsonb(new)) or
(old.status='passed' and (new.status<>'rejected' or
(to_jsonb(old)-array['status','queue_state','status_revision','status_updated_at','updated_at'])<>
(to_jsonb(new)-array['status','queue_state','status_revision','status_updated_at','updated_at']))))
then raise exception 'Unexpected lead changes';end if;
if exists((select * from preserved_assignments except select * from public.lead_assignments)
union all (select * from public.lead_assignments except select * from preserved_assignments))
then raise exception 'Assignment history changed';end if;
if exists(select * from preserved_events except select * from public.lead_events)
then raise exception 'Existing events changed';end if;
if exists(select 1 from public.leads where status='passed') then raise exception 'Passed remains';end if;
end $$;
insert into supabase_migrations.schema_migrations(version,name,statements)
values('${version}','merge_passed_into_rejected',array[$source$${source}$source$]);
select (select count(*) from preserved_leads where status='passed') converted,
(select count(*) from public.leads where status='passed') passed_remaining,
(select count(*) from public.leads where status='rejected') rejected_total;
commit;`;
const result=JSON.parse(execFileSync('npx',['supabase','db','query','--linked','--project-ref',ref,sql,'--output','json'],{encoding:'utf8',maxBuffer:16*1024*1024}));
console.log(JSON.stringify(result.rows));
