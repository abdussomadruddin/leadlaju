begin;
set local statement_timeout='60s';
-- Fixtures are isolated and everything, including the migration, rolls back.
insert into public.brands(id,name,slug) values('99000000-0000-4000-8000-000000000001','Follow Four Fixture','follow-four-fixture');
insert into public.dispatch_state(brand_id,singleton) values('99000000-0000-4000-8000-000000000001',true);
insert into auth.users(id,email) values('99100000-0000-4000-8000-000000000001','follow-four@example.invalid');
insert into public.profiles(id,name,email,role,approval_status,active,brand_id) values('99100000-0000-4000-8000-000000000001','Follow Four','follow-four@example.invalid','agent','approved',true,'99000000-0000-4000-8000-000000000001');
insert into public.projects(id,brand_id,name) values('99200000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000001','Follow Four Product');
insert into public.leads(id,brand_id,ingestion_fingerprint,name,phone,project_id,status,queue_state,assigned_agent_id,created_at,follow_up_count)
 select ('99300000-0000-4000-8000-'||lpad(g.n::text,12,'0'))::uuid,'99000000-0000-4000-8000-000000000001','four-'||g.n,'Fixture','60120000000','99200000-0000-4000-8000-000000000001',
 case when g.n=3 then 'potential' else 'contacted' end::public.leadlaju_lead_status,
 case when g.n=3 then 'potential' else 'contacted' end::public.leadlaju_queue_state,'99100000-0000-4000-8000-000000000001',now(),case when g.n=1 then 2 else 4 end
 from generate_series(1,3) g(n);
-- INSTALL MIGRATION HERE
do $$begin
 if (select status from public.leads where id='99300000-0000-4000-8000-000000000002')<>'all_offer_presented' then raise exception 'Contacted backfill failed';end if;
 if (select status from public.leads where id='99300000-0000-4000-8000-000000000003')<>'potential' then raise exception 'Potential overwritten';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"99100000-0000-4000-8000-000000000001","role":"authenticated"}',true),set_config('request.headers','{}',true);
set local role authenticated;
do $$declare r jsonb;begin
 r:=public.record_lead_follow_up('99300000-0000-4000-8000-000000000001',2);
 if r->>'status'<>'contacted' or (r->>'follow_up_count')::int<>3 then raise exception 'Three changed status';end if;
 r:=public.record_lead_follow_up('99300000-0000-4000-8000-000000000001',3);
 if r->>'status'<>'all_offer_presented' then raise exception 'Four failed to promote';end if;
 r:=public.record_lead_follow_up('99300000-0000-4000-8000-000000000003',4);
 if r->>'status'<>'potential' then raise exception 'Potential action overwritten';end if;
 if jsonb_array_length(public.get_follow_up_due()->'leads')<>0 then raise exception 'Promoted lead still Due';end if;
 if has_function_privilege('anon','public.record_lead_follow_up(uuid,integer)','execute') then raise exception 'Anonymous action allowed';end if;
end$$;
reset role;
-- Defense in depth: a later manual Contacted status must still exclude count 4.
update public.leads set status='contacted',queue_state='contacted' where id='99300000-0000-4000-8000-000000000001';
update public.leads set follow_up_activity_at=now()-interval '25 hours' where id='99300000-0000-4000-8000-000000000001';
set local role authenticated;
do $$declare report jsonb;begin
 if jsonb_array_length(public.get_follow_up_due()->'leads')<>0 then raise exception 'Four re-entered Due';end if;
 report:=public.get_agent_performance_report(p_from:=current_date-6,p_to:=current_date,p_agent_id:=auth.uid());
 if exists(select 1 from jsonb_array_elements(report->'rows') r where (r->>'due_now')::int<>0) then raise exception 'Four counted in due report';end if;
end$$;
reset role;
rollback;
select 'PASS: Follow Up 3 unchanged, 4 promotes Contacted, other status preserved, backfill, Due exclusion and anonymous denial; all changes rolled back' result;
