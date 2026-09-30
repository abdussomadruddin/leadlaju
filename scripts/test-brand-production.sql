-- Execute after migration, before the first real Master/new brand is enabled.
-- Everything rolls back: no test accounts, brand, leads or notifications remain.
begin;
set local statement_timeout='30s';
insert into public.brands(id,name,slug) values
 ('90000000-0000-4000-8000-000000000001','Isolation Test A','isolation-test-a'),
 ('90000000-0000-4000-8000-000000000002','Isolation Test B','isolation-test-b');
insert into public.dispatch_state(brand_id,singleton) values
 ('90000000-0000-4000-8000-000000000001',true),('90000000-0000-4000-8000-000000000002',true);
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','isolation-admin-a@example.invalid'),
 ('91000000-0000-4000-8000-000000000002','isolation-admin-b@example.invalid'),
 ('91000000-0000-4000-8000-000000000003','isolation-agent-a@example.invalid');
insert into public.profiles(id,name,email,role,approval_status,active,brand_id) values
 ('91000000-0000-4000-8000-000000000001','Fixture A','isolation-admin-a@example.invalid','admin','approved',true,'90000000-0000-4000-8000-000000000001'),
 ('91000000-0000-4000-8000-000000000002','Fixture B','isolation-admin-b@example.invalid','admin','approved',true,'90000000-0000-4000-8000-000000000002'),
 ('91000000-0000-4000-8000-000000000003','Fixture Agent','isolation-agent-a@example.invalid','agent','approved',true,'90000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true),set_config('request.headers','{}',true);
set local role authenticated;
do $$ declare x jsonb; begin
 x:=public.admin_upsert_project('{"name":"Same Isolation Project"}');
 x:=public.admin_ingest_manual_lead('{"id":"same-isolation-id","name":"Fixture","phone":"60120000000","project":"Same Isolation Project"}');
 if (select count(*) from public.leads)<>1 then raise exception 'Admin A RLS isolation failed'; end if;
 if jsonb_array_length(public.get_dashboard_state()->'leads')<>1 then raise exception 'Admin dashboard isolation failed'; end if;
 if leadlaju_private.can_subscribe_brand_topic('brand:90000000-0000-4000-8000-000000000002:operations') then raise exception 'Cross-brand Realtime allowed'; end if;
 begin perform public.master_manage_brand('list'); raise exception 'Admin accessed Master'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ declare x jsonb; begin
 if (select count(*) from public.leads)<>0 then raise exception 'Admin B leaked A leads'; end if;
 x:=public.admin_upsert_project('{"name":"Same Isolation Project"}');
 x:=public.admin_ingest_manual_lead('{"id":"same-isolation-id","name":"Fixture","phone":"60120000000","project":"Same Isolation Project"}');
 if (select count(*) from public.leads)<>1 then raise exception 'Brand identity uniqueness failed'; end if;
 begin
   perform set_config('request.headers','{"x-leadlaju-brand":"90000000-0000-4000-8000-000000000001"}',true);
   perform public.get_dashboard_state(); raise exception 'Forged brand accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',true),set_config('request.headers','{}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.leads)<>0 then raise exception 'Agent read unowned leads'; end if;
 begin perform public.admin_upsert_project('{"name":"Forbidden"}'); raise exception 'Agent accessed admin RPC'; exception when others then
   if sqlerrm='Agent accessed admin RPC' then raise; end if;
 end;
 begin perform public.get_agent_performance_report(current_date-7,current_date,null,'91000000-0000-4000-8000-000000000002'); raise exception 'Agent accessed other performance'; exception when others then
   if sqlerrm='Agent accessed other performance' then raise; end if;
 end;
 if leadlaju_private.can_subscribe_brand_topic('admin:operations') then raise exception 'Global topic still accessible'; end if;
end $$;
reset role;
select 'PASS: production Admin/Agent RLS, direct RPC, duplicate identity, reports and Realtime authorization. All fixtures rolled back.' as result;
rollback;
