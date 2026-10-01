-- All fixture writes and broadcasts roll back. Never expire or claim the
-- real Safrich queue/outbox. Infrastructure is real, including tenant RLS.
begin;
set local statement_timeout='30s';
insert into public.brands(id,name,slug,distribution_mode) values
 ('92000000-0000-4000-8000-000000000001','Sales Release Fixture','sales-release-fixture','team_sales'),
 ('92000000-0000-4000-8000-000000000002','Agent Release Fixture','agent-release-fixture','agent');
insert into public.dispatch_state(brand_id,singleton) values
 ('92000000-0000-4000-8000-000000000001',true),('92000000-0000-4000-8000-000000000002',true);
insert into auth.users(id,email) select ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'sales-release-'||n||'@example.invalid' from generate_series(1,4) n;
insert into public.profiles(id,name,email,role,approval_status,active,brand_id)
 select ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Release Fixture','sales-release-'||n||'@example.invalid',case when n=1 then 'admin' else 'agent' end::public.leadlaju_role,'approved',true,'92000000-0000-4000-8000-000000000001' from generate_series(1,4) n;
insert into public.projects(id,brand_id,name) values('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Release Fixture Project');
insert into public.agent_project_eligibility(brand_id,agent_id,project_id)
 select brand_id,id,'94000000-0000-4000-8000-000000000001' from public.profiles where brand_id='92000000-0000-4000-8000-000000000001' and role='agent';
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',true),set_config('request.headers','{}',true);
set local role authenticated;
do $$ declare n integer;report jsonb;begin
 for n in 1..7 loop perform public.admin_ingest_manual_lead(jsonb_build_object('id','sales-release-'||n,'name','Release lead fixture','phone','60120000000','project','Release Fixture Project'));end loop;
 perform public.admin_ingest_manual_lead('{"id":"sales-release-1","name":"Release lead fixture","phone":"60120000000","project":"Release Fixture Project"}');
 if (select count(*) from public.leads)<>7 then raise exception 'Duplicate or RLS failure';end if;
 if (select array_agg(c.n order by c.n) from (select count(*) n from public.leads group by assigned_agent_id) c)<>array[2,2,3]::bigint[] then raise exception 'Round robin failed';end if;
 if (select count(*) from public.lead_assignments where outcome='pending' and expires_at is null and assignment_mode='team_sales')<>7 then raise exception 'No expiry assignments failed';end if;
 report:=public.get_agent_performance_report(current_date-7,current_date);
 if report->>'response_sla_applicable'<>'false' or exists(select 1 from jsonb_array_elements(report->'rows') x where x?'within_five') then raise exception 'Sales SLA leaked';end if;
 if leadlaju_private.can_subscribe_brand_topic('brand:92000000-0000-4000-8000-000000000002:operations') then raise exception 'Realtime brand isolation failed';end if;
 begin perform public.master_manage_brand('create','{"name":"Forbidden","slug":"forbidden","distribution_mode":"team_sales"}');raise exception 'Admin created a brand';exception when insufficient_privilege then null;end;
 begin update public.brands set distribution_mode='agent' where id='92000000-0000-4000-8000-000000000001';raise exception 'Admin changed mode';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.notification_outbox where brand_id='92000000-0000-4000-8000-000000000001' and notification_type='sales_new_lead')<>7 then raise exception 'Sales push outbox failed';end if;
end $$;
select set_config('fixture.other_owner_lead',(select id::text from public.leads where brand_id='92000000-0000-4000-8000-000000000001' and assigned_agent_id='93000000-0000-4000-8000-000000000003' limit 1),true);
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ declare l public.leads; result jsonb;action uuid:=gen_random_uuid();begin
 select * into l from public.leads order by id limit 1;
 if l.id is null or (select count(*) from public.leads)<>3 then raise exception 'Owner RLS or multi-New failed';end if;
 result:=public.team_sales_contact(l.id,'call',action,l.assignment_revision);
 result:=public.team_sales_contact(l.id,'call',action,l.assignment_revision);
 if (select count(*) from public.lead_events where lead_id=l.id and event_type='sales_contact')<>1 then raise exception 'Idempotent contact failed';end if;
 if (select follow_up_count from public.leads where id=l.id)<>0 then raise exception 'Ordinary contact incremented Follow Up';end if;
 begin perform public.contact_assignment(gen_random_uuid(),l.id,l.assignment_revision);raise exception 'Sales used CALL NOW';exception when insufficient_privilege then null;end;
 begin
   perform public.team_sales_contact(current_setting('fixture.other_owner_lead')::uuid,'whatsapp',gen_random_uuid(),1);
   raise exception 'Other owner action accepted';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('request.headers','{"x-leadlaju-brand":"92000000-0000-4000-8000-000000000001"}',true);
-- Keep the trusted operator role; the service claim scopes the scheduler gateway
-- to this fixture only. No API grants are broadened for testing.
do $$ begin
 if leadlaju_private.expire_assignments(now()+interval '2 days')<>0 then raise exception 'Sales expiry executed';end if;
 if (select count(*) from public.leads where brand_id='92000000-0000-4000-8000-000000000001' and queue_state='sales_assigned')<>6 then raise exception 'Sales New expired';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true);
do $$ begin
 begin update public.brands set distribution_mode='agent' where id='92000000-0000-4000-8000-000000000001';raise exception 'Operator mode mutation accepted';exception when others then if sqlerrm='Operator mode mutation accepted' then raise;end if;end;
end $$;
select 'PASS: production Team Sales 3/2/2, offline allocation, duplicate, no expiry, owner/brand RLS, action idempotency, reports and immutable modes. All fixtures rolled back.' as result;
rollback;
