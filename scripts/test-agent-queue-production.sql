-- Real dispatcher/RLS integration. All fixture writes/outbox rows roll back.
begin;
set local statement_timeout='30s';
insert into public.brands(id,name,slug,follow_up_due_limit) values
 ('98000000-0000-4000-8000-000000000001','Queue Audit Fixture','queue-audit-fixture',1);
insert into public.dispatch_state(brand_id,singleton,queue_cycle) values
 ('98000000-0000-4000-8000-000000000001',true,100);
insert into auth.users(id,email) select ('98100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'queue-audit-'||n||'@example.invalid' from generate_series(1,2) n;
insert into public.profiles(id,name,email,role,approval_status,active,brand_id)
 select ('98100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Queue Audit','queue-audit-'||n||'@example.invalid','agent','approved',true,'98000000-0000-4000-8000-000000000001' from generate_series(1,2) n;
insert into public.projects(id,brand_id,name) select ('98200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'98000000-0000-4000-8000-000000000001','Queue Project '||n from generate_series(1,2) n;
insert into public.agent_project_eligibility(brand_id,agent_id,project_id) select '98000000-0000-4000-8000-000000000001',id,'98200000-0000-4000-8000-000000000001' from public.profiles where brand_id='98000000-0000-4000-8000-000000000001';
insert into public.agent_availability(brand_id,agent_id,lead_ready,notification_ready,presence_lease_until,last_seen_at)
 select brand_id,id,true,true,now()+interval '1 hour',now() from public.profiles where brand_id='98000000-0000-4000-8000-000000000001';
insert into public.leads(id,brand_id,source_system,ingestion_fingerprint,name,phone,project_id,status,queue_state,pass_count,retry_after_cycle,created_at)
 values ('98300000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','manual','queue-audit-1','Retry Fixture','60120000000','98200000-0000-4000-8000-000000000001','new','queued',1,101,now()),
 ('98300000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000001','manual','queue-audit-2','Unassignable Fresh','60120000001','98200000-0000-4000-8000-000000000002','new','queued',0,0,now());
select set_config('leadlaju.worker_brand','98000000-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true);
do $$ declare n integer; gate text; begin
 -- Exhaustive gates for fresh candidates: an ineligible fresh queue never blocks retry.
 for gate in select unnest(array['permission','cooldown','expired','notifications','stopped','inactive','unapproved','blocked','occupied']) loop
   begin
     update public.profiles set get_lead_allowed=(gate<>'permission'),cooldown_until=case when gate='cooldown' then now()+interval '1 hour' end,
       active=(gate<>'inactive'),approval_status=case when gate='unapproved' then 'pending'::public.leadlaju_approval_status else 'approved'::public.leadlaju_approval_status end
     where id='98100000-0000-4000-8000-000000000002';
     update public.agent_availability set lead_ready=(gate<>'stopped'),notification_ready=(gate<>'notifications'),presence_lease_until=case when gate='expired' then now()-interval '1 second' else now()+interval '1 hour' end where agent_id='98100000-0000-4000-8000-000000000002';
     if gate='blocked' then
       insert into public.leads(brand_id,source_system,ingestion_fingerprint,name,phone,project_id,status,queue_state,assigned_agent_id,created_at,follow_up_activity_at)
       select '98000000-0000-4000-8000-000000000001','manual','audit-due-'||g.value,'Due Fixture','60120000000','98200000-0000-4000-8000-000000000001','contacted','contacted','98100000-0000-4000-8000-000000000002',now(),now()-interval '25 hours' from generate_series(1,2) g(value);
     elsif gate='occupied' then
       insert into public.leads(brand_id,source_system,ingestion_fingerprint,name,phone,project_id,status,queue_state,assigned_agent_id,created_at,received_at,expires_at)
       values('98000000-0000-4000-8000-000000000001','manual','audit-occupied','Occupied Fixture','60120000000','98200000-0000-4000-8000-000000000001','new','active','98100000-0000-4000-8000-000000000002',now(),now(),now()+interval '5 minutes');
     end if;
     -- Both accounts qualify for retry project; only account 2 qualifies for fresh project.
     insert into public.agent_project_eligibility(brand_id,agent_id,project_id) values('98000000-0000-4000-8000-000000000001','98100000-0000-4000-8000-000000000002','98200000-0000-4000-8000-000000000002');
     n:=leadlaju_private.dispatch_available_leads_agent_brand(now());
     if n<>1 or (select assigned_agent_id from public.leads where id='98300000-0000-4000-8000-000000000001')<>'98100000-0000-4000-8000-000000000001' then raise exception 'FAIL gate %',gate;end if;
     if leadlaju_private.dispatch_available_leads_agent_brand(now())<>0 then raise exception 'Duplicate dispatch';end if;
     if (select count(*) from public.lead_assignments where brand_id='98000000-0000-4000-8000-000000000001')<>1 then raise exception 'Duplicate assignment';end if;
     if (select count(*) from public.notification_outbox where brand_id='98000000-0000-4000-8000-000000000001' and notification_type='new_lead')<>1 then raise exception 'Missing/duplicate push';end if;
     raise exception using errcode='P0002',message='rollback fixture case';
   exception when no_data_found then null; end;
 end loop;
 -- Eligible fresh leads keep precedence; each free account still gets at most one.
 begin
   insert into public.agent_project_eligibility(brand_id,agent_id,project_id) values('98000000-0000-4000-8000-000000000001','98100000-0000-4000-8000-000000000002','98200000-0000-4000-8000-000000000002');
   n:=leadlaju_private.dispatch_available_leads_agent_brand(now());
   if n<>2 or (select retry_cycle from public.lead_assignments where lead_id='98300000-0000-4000-8000-000000000001')<>101 then raise exception 'Fresh precedence or retry cycle changed';end if;
   raise exception using errcode='P0002',message='rollback fixture case';
 exception when no_data_found then null;end;
 begin
   update public.agent_availability set lead_ready=false where brand_id='98000000-0000-4000-8000-000000000001';
   if leadlaju_private.dispatch_available_leads_agent_brand(now())<>0 or (select queue_cycle from public.dispatch_state where brand_id='98000000-0000-4000-8000-000000000001')<>100 then raise exception 'No recipient advanced queue';end if;
   raise exception using errcode='P0002',message='rollback fixture case';
 exception when no_data_found then null;end;
 n:=leadlaju_private.dispatch_available_leads_agent_brand(now());
 if n<>1 then raise exception 'Unrelated project blocked retry';end if;
 if (select queue_cycle from public.dispatch_state where brand_id='98000000-0000-4000-8000-000000000001')<>101 then raise exception 'Wrong cycle';end if;
 if exists(select 1 from public.leads where brand_id='98000000-0000-4000-8000-000000000001' and queue_state='active' and expires_at<>received_at+interval '5 minutes') then raise exception 'Timer changed';end if;
end $$;
rollback;
select 'PASS: nine account gates, unrelated project retry, fresh precedence, no recipient, duplicate dispatch, one assignment/push, five-minute timer; all fixtures rolled back' result;
