-- Disposable local PostgreSQL only. No fixture survives this transaction.
begin;
select set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true);
do $test$
declare b uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
 l uuid:=gen_random_uuid(); old_cursor public.dispatch_state; new_cursor public.dispatch_state; n integer;
begin
 insert into public.brands(id,name,slug) values(b,'Resource Fixture','resource-'||b::text);
 perform set_config('leadlaju.worker_brand',b::text,true);
 insert into public.dispatch_state(brand_id,singleton) values(b,true);
 insert into auth.users(id,email) values(a,a||'@test.invalid');
 insert into public.profiles(id,brand_id,name,email,role,active,approval_status)
 values(a,b,'Resource Fixture',a||'@test.invalid','agent',true,'approved');
 insert into public.projects(id,brand_id,name) values(project,b,'Resource Fixture');
 insert into public.agent_project_eligibility(brand_id,agent_id,project_id) values(b,a,project);
 insert into public.agent_availability(brand_id,agent_id,lead_ready,notification_ready,presence_lease_until)
 values(b,a,false,true,now()+interval '1 hour');
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,created_at)
 values(l,b,'Resource Fixture','601199990090',project,l::text,'new','queued',now());
 select * into old_cursor from public.dispatch_state where brand_id=b;
 n:=leadlaju_private.dispatch_available_leads_current_cycle(now()+interval '1 second');
 select * into new_cursor from public.dispatch_state where brand_id=b;
 if n<>0 or to_jsonb(old_cursor)<>to_jsonb(new_cursor) then raise exception 'Idle cycle wrote cursor'; end if;
 n:=leadlaju_private.dispatch_available_leads_agent_brand(now()+interval '1 second');
 if n<>0 then raise exception 'GET LEAD off assigned'; end if;
 if (select assignment_revision from public.leads where id=l)<>0 then raise exception 'Idle guard changed lead'; end if;
 update public.agent_availability set lead_ready=true where agent_id=a;
 n:=leadlaju_private.dispatch_available_leads_agent_brand(now());
 if n<>1 or not exists(select 1 from public.leads where id=l and assigned_agent_id=a and queue_state='active') then
   raise exception 'Ready recipient was skipped';
 end if;
 if (select count(*) from public.lead_assignments where lead_id=l)<>1
   or (select count(*) from public.notification_outbox where lead_id=l and notification_type='new_lead')<>1 then
   raise exception 'Assignment/outbox not exactly once';
 end if;
 n:=leadlaju_private.dispatch_available_leads_agent_brand(now());
 if n<>0 or (select count(*) from public.lead_assignments where lead_id=l)<>1 then raise exception 'Repeated dispatch duplicated'; end if;
 -- Caller-scoped RPCs retain the old synchronous path even if a scheduler lock
 -- exists. Cross-brand and old-owner checks remain covered by the main suite.
 if has_function_privilege('anon','public.get_dashboard_state()','execute') then raise exception 'Anonymous dashboard access'; end if;
end $test$;
rollback;
