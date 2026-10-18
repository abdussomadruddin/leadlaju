// Migration and fixture data are always rolled back. No production data is exported.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const migration=fs.readFileSync('supabase/migrations/20261018155156_admin_lead_excel_export.sql','utf8');
const fixture=fs.readFileSync('scripts/test-team-sales-production.sql','utf8').split('do $$ declare n integer;report')[0].replace('begin;','');
const sql=`begin;set local statement_timeout='30s';${migration}${fixture}
reset role;
insert into public.leads(brand_id,source_system,source_lead_id,ingestion_fingerprint,name,phone,email,notes,project_id,created_at)
select '92000000-0000-4000-8000-000000000001','export-fixture',g::text,'export-'||g,'Nama '||g,'0123456789','email@example.invalid',E'Nota\\nBaris dua','94000000-0000-4000-8000-000000000001',now() from generate_series(1,510) g;
insert into public.projects(id,brand_id,name) values('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','Other project');
insert into public.leads(brand_id,ingestion_fingerprint,name,phone,project_id,created_at) values('92000000-0000-4000-8000-000000000002','foreign-export','Foreign','999','94000000-0000-4000-8000-000000000002',now());
set local role authenticated;
do $$ declare a jsonb; b jsonb; cursor_id uuid; begin
 a:=public.export_brand_leads_page();
 if a->>'total'<>'510' or jsonb_array_length(a->'rows')<>500 or not (a->>'has_more')::boolean then raise exception 'First page mismatch';end if;
 cursor_id:=(a->'rows'->499->>'id')::uuid;
 b:=public.export_brand_leads_page(cursor_id,(a->>'cutoff')::timestamptz);
 if jsonb_array_length(b->'rows')<>10 or (b->>'has_more')::boolean then raise exception 'Second page mismatch';end if;
 if exists(select 1 from jsonb_array_elements(a->'rows') x where x->>'name'='Foreign' or x->>'phone'<>'0123456789') then raise exception 'Data mismatch';end if;
 perform set_config('request.headers','{"x-leadlaju-brand":"92000000-0000-4000-8000-000000000002"}',true);
 begin perform public.export_brand_leads_page();raise exception 'Cross-brand export accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.headers','{}',true);
 perform set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 begin perform public.export_brand_leads_page();raise exception 'Agent export accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into auth.users(id,email) values('93000000-0000-4000-8000-000000000005','export-master@example.invalid');
insert into public.profiles(id,name,email,role,approval_status,active) values('93000000-0000-4000-8000-000000000005','Export Master','export-master@example.invalid','master','approved',true);
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000005","role":"authenticated"}',true),set_config('request.headers','{"x-leadlaju-brand":"92000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
do $$ declare result jsonb; begin
 result:=public.export_brand_leads_page();
 if result->>'total'<>'1' or result->>'distribution_mode'<>'agent' or result->'rows'->0->>'name'<>'Foreign' then raise exception 'Master selected brand failed';end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.export_brand_leads_page(uuid,timestamptz)','EXECUTE') then raise exception 'Anonymous export permission';end if;
 if (select count(*) from public.leads where brand_id='92000000-0000-4000-8000-000000000001')<>510 then raise exception 'Export modified leads';end if;
end $$;
select 'PASS: 510 rows, cursor pagination, unassigned data, owner/brand authorization; rolled back' result;
rollback;`;
console.log(execFileSync('npx',['supabase','db','query','--linked','--project-ref','zvplvrtqvsfrftnjfdsh','--output','json','--',sql],{encoding:'utf8',maxBuffer:4*1024*1024}));
