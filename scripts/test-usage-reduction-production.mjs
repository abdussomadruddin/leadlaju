// Use only rollback fixtures. Never claim/send a real notification.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const migration=fs.readFileSync('supabase/migrations/20261018183242_reduce_dashboard_and_idle_push_usage.sql','utf8');
const fixture=fs.readFileSync('scripts/test-team-sales-production.sql','utf8').split('do $$ declare n integer;report')[0].replace('begin;','');
const sql=`begin;set local statement_timeout='30s';${fixture}
reset role;
insert into public.leads(brand_id,ingestion_fingerprint,name,phone,email,notes,project_id,created_at)
values('92000000-0000-4000-8000-000000000001','usage-fixture','Usage Fixture','60123456789','fixture@example.invalid',E'Nota\\nDua','94000000-0000-4000-8000-000000000001',now());
create temporary table before_snapshot(data jsonb);
grant select,insert on before_snapshot to authenticated;
set local role authenticated;
insert into before_snapshot select public.get_dashboard_state();
reset role;
${migration}
set local role authenticated;
do $$declare old jsonb;current jsonb;begin
 select data into old from before_snapshot;
 current:=public.get_dashboard_state();
 if old-'leads' is distinct from current-'leads' then raise exception 'Non-lead dashboard changed';end if;
 if jsonb_array_length(old->'leads')<>jsonb_array_length(current->'leads') then raise exception 'Lead count changed';end if;
 if exists(select 1 from jsonb_array_elements(current->'leads') n join jsonb_array_elements(old->'leads') o on o->>'id'=n->>'id',lateral jsonb_each(n) kv where kv.value is distinct from o->kv.key) then raise exception 'Lead field changed';end if;
end $$;
reset role;
do $$begin
 if (select schedule from cron.job where jobname='leadlaju-process-notification-outbox')<>'5 seconds' then raise exception 'Recovery cadence changed';end if;
 if has_function_privilege('anon','public.get_dashboard_state()','EXECUTE') then raise exception 'Anonymous access';end if;
end $$;
select 'PASS compact payload, preserved data/RLS and recovery cadence; rollback' result;rollback;`;
console.log(execFileSync('npx',['supabase','db','query','--linked','--project-ref','zvplvrtqvsfrftnjfdsh','--output','json','--',sql],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000}));
