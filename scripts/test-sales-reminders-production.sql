-- Real production SQL/RLS; all fixtures, cutoff changes and outbox writes roll back.
begin;
set local statement_timeout='30s';
insert into public.brands(id,name,slug,distribution_mode) values('95000000-0000-4000-8000-000000000001','Reminder Test','reminder-release-test','team_sales');
insert into public.dispatch_state(brand_id,singleton) values('95000000-0000-4000-8000-000000000001',true);
insert into auth.users(id,email) values('96000000-0000-4000-8000-000000000001','reminder-admin@example.invalid'),('96000000-0000-4000-8000-000000000002','reminder-owner@example.invalid');
insert into public.profiles(id,name,email,role,approval_status,active,brand_id) values
('96000000-0000-4000-8000-000000000001','Fixture Admin','reminder-admin@example.invalid','admin','approved',true,'95000000-0000-4000-8000-000000000001'),
('96000000-0000-4000-8000-000000000002','Fixture Owner','reminder-owner@example.invalid','agent','approved',true,'95000000-0000-4000-8000-000000000001');
insert into public.projects(id,brand_id,name) values('97000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','Reminder Product');
insert into public.agent_project_eligibility(brand_id,agent_id,project_id) values('95000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','97000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"96000000-0000-4000-8000-000000000001","role":"authenticated"}',true),set_config('request.headers','{}',true);
set local role authenticated;
select public.admin_ingest_manual_lead('{"id":"reminder-test-one","name":"Reminder One","phone":"60120000001","project":"Reminder Product"}')->>'ok';
select public.admin_ingest_manual_lead('{"id":"reminder-test-two","name":"Reminder Two","phone":"60120000002","project":"Reminder Product"}')->>'ok';
do $$ begin
 if (select count(*) from public.leads)<>2 then raise exception 'Admin brand isolation failed';end if;
 begin perform public.validate_sales_contact_reminder(auth.uid(),'sales_contact_15','{}');raise exception 'Public worker RPC allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update leadlaju_private.sales_reminder_release set activated_at=now()-interval '2 hours';
update public.leads set created_at=now()-case when name='Reminder One' then interval '20 minutes' else interval '70 minutes' end where brand_id='95000000-0000-4000-8000-000000000001';
select leadlaju_private.enqueue_sales_contact_reminders(now());
select leadlaju_private.enqueue_sales_contact_reminders(now());
do $$ declare n public.notification_outbox; begin
 if (select count(*) from public.notification_outbox where brand_id='95000000-0000-4000-8000-000000000001' and notification_type like 'sales_contact_%')<>3 then raise exception 'Threshold or dedupe failed';end if;
 for n in select * from public.notification_outbox where brand_id='95000000-0000-4000-8000-000000000001' and notification_type like 'sales_contact_%' loop
  if public.validate_sales_contact_reminder(n.user_id,n.notification_type,n.payload) is null then raise exception 'Valid reminder rejected';end if;
 end loop;
end $$;
update public.leads set status='contacted',queue_state='contacted' where brand_id='95000000-0000-4000-8000-000000000001';
do $$ declare n public.notification_outbox; begin
 for n in select * from public.notification_outbox where brand_id='95000000-0000-4000-8000-000000000001' and notification_type like 'sales_contact_%' loop
  if public.validate_sales_contact_reminder(n.user_id,n.notification_type,n.payload) is not null then raise exception 'Stale reminder delivered';end if;
 end loop;
end $$;
select leadlaju_private.enqueue_sales_contact_reminders(now());
do $$ begin
 if exists(select 1 from public.notification_outbox where brand_id='95000000-0000-4000-8000-000000000001' and notification_type like 'sales_contact_%' and sent_at is null) then raise exception 'Stale jobs not cancelled';end if;
end $$;
select 'PASS: production reminder thresholds, late assignment, duplicate scheduler, worker grants, brand RLS and stale cancellation. All changes rolled back.' as result;
rollback;
