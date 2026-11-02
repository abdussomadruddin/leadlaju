-- Disposable local PostgreSQL only. The migration is tested with existing rows.
begin;
select set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true);
create temporary table neglect_fixture(data jsonb);
create temporary table neglect_before(data jsonb);
do $setup$
declare b uuid:=gen_random_uuid(); other_b uuid:=gen_random_uuid(); sales uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid(); other_adm uuid:=gen_random_uuid(); sales_adm uuid:=gen_random_uuid(); master_id uuid:=gen_random_uuid();
 pr uuid:=gen_random_uuid(); old_lead uuid:=gen_random_uuid(); note_lead uuid:=gen_random_uuid(); follow_lead uuid:=gen_random_uuid(); stale_lead uuid:=gen_random_uuid(); held uuid:=gen_random_uuid();
begin
 insert into public.brands(id,name,slug) values(b,'Neglect days fixture','days-'||b),(other_b,'Other days fixture','days-'||other_b);
 insert into public.brands(id,name,slug,distribution_mode) values(sales,'Sales days fixture','days-'||sales,'team_sales');
 insert into public.dispatch_state(brand_id,singleton) values(b,true),(other_b,true),(sales,true);
 perform set_config('leadlaju.worker_brand',b::text,true);
 insert into auth.users(id,email) select id,id||'@test.invalid' from unnest(array[a,adm,other_adm,sales_adm,master_id]) id;
 insert into public.profiles(id,brand_id,name,email,role,active,approval_status) values
 (a,b,'Agent',a||'@test.invalid','agent',true,'approved'),(adm,b,'Admin',adm||'@test.invalid','admin',true,'approved'),
 (other_adm,other_b,'Other',other_adm||'@test.invalid','admin',true,'approved'),(sales_adm,sales,'Sales',sales_adm||'@test.invalid','admin',true,'approved'),
 (master_id,null,'Master',master_id||'@test.invalid','master',true,'approved');
 insert into public.projects(id,brand_id,name) values(pr,b,'Days project');
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,assigned_agent_id,neglect_activity_at,contacted_at,follow_up_activity_at,notes,created_at)
 select id,b,'Legacy','60110000000',pr,id::text,'contacted','contacted',a,activity,activity,activity,'Original note',now()-interval '7 days'
 from (values(old_lead,now()-interval '4 days'),(note_lead,now()-interval '2 days'),(follow_lead,now()-interval '2 days'),(stale_lead,now()-interval '6 days')) x(id,activity);
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,neglected_held,neglected_at,notes,created_at)
 values(held,b,'Already held','60110000001',pr,held::text,'contacted','need_follow_up',true,now(),'Held note',now()-interval '7 days');
 insert into neglect_before select jsonb_agg(to_jsonb(l) order by l.id) from public.leads l where l.brand_id=b;
 insert into neglect_fixture values(jsonb_build_object('brand',b,'other',other_b,'sales',sales,'agent',a,'admin',adm,'other_admin',other_adm,'sales_admin',sales_adm,'master',master_id,'project',pr,'old',old_lead,'note',note_lead,'follow',follow_lead,'stale',stale_lead,'held',held));
end $setup$;
set constraints all immediate;
-- Match production hardening; migration must not leave CREATE on the runtime role.
revoke create on schema public,leadlaju_private from leadlaju_tenant_executor;
-- INSTALL_NEGLECT_DAYS_MIGRATION
set constraints all deferred;

do $test$
declare f jsonb; b uuid; a uuid; adm uuid; l uuid; n uuid; fl uuid; prior_due timestamptz; prior_activity timestamptz; old_due timestamptz; due timestamptz; r jsonb; cnt integer; invalid_days integer; sales_project uuid:=gen_random_uuid(); sales_lead uuid:=gen_random_uuid(); stamped_lead uuid:=gen_random_uuid();
begin
 select data into f from neglect_fixture; b:=(f->>'brand')::uuid; a:=(f->>'agent')::uuid; adm:=(f->>'admin')::uuid; l:=(f->>'old')::uuid; n:=(f->>'note')::uuid; fl:=(f->>'follow')::uuid;
 if exists(select 1 from public.brands where id in (b,(f->>'other')::uuid,(f->>'sales')::uuid) and neglect_days<>5) then raise exception 'Default changed';end if;
 if (select jsonb_agg(to_jsonb(x)-'neglect_due_at' order by x.id) from public.leads x where brand_id=b) is distinct from (select data from neglect_before) then raise exception 'Backfill mutated legacy fields/history/timestamps';end if;
 if exists(select 1 from public.leads where brand_id=b and assigned_agent_id is not null and neglect_due_at is distinct from neglect_activity_at+interval '120 hours') then raise exception 'Backfill reset old clock';end if;
 if exists(select 1 from public.leads where id=(f->>'held')::uuid and (neglect_due_at is not null or not neglected_held)) then raise exception 'Held lead changed';end if;
 if has_function_privilege('anon','public.admin_set_neglect_days(integer)','execute') or has_function_privilege('service_role','public.admin_set_neglect_days(integer)','execute') then raise exception 'Unexpected RPC access';end if;
 if not has_function_privilege('authenticated','public.admin_set_neglect_days(integer)','execute') then raise exception 'Missing authenticated grant';end if;
 if (select relrowsecurity from pg_class where oid='public.brands'::regclass) is not true then raise exception 'RLS disabled';end if;
 if has_schema_privilege('leadlaju_tenant_executor','public','CREATE') or has_schema_privilege('leadlaju_tenant_executor','leadlaju_private','CREATE') then raise exception 'Runtime CREATE was widened';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 begin perform public.admin_set_neglect_days(3);raise exception 'Agent accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',adm,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',f->>'other')::text,true);
 begin perform public.admin_set_neglect_days(3);raise exception 'Cross brand accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',b)::text,true);
 foreach invalid_days in array array[2,15,0] loop
  begin perform public.admin_set_neglect_days(invalid_days);raise exception 'Invalid days accepted';exception when invalid_parameter_value then null;end;
 end loop;
 begin perform public.admin_set_neglect_days(null);raise exception 'Null days accepted';exception when invalid_parameter_value then null;end;
 select neglect_due_at,neglect_activity_at into prior_due,prior_activity from public.leads where id=l;
 r:=public.admin_set_neglect_days(3);
 if r->>'neglect_days'<>'3' or (select neglect_days from public.brands where id=(f->>'other')::uuid)<>5 then raise exception 'Setting / tenant mismatch';end if;
 if exists(select 1 from public.leads where brand_id=b and neglected_held and id<>(f->>'held')::uuid) then raise exception 'Save retracted lead';end if;
 if (select neglect_due_at from public.leads where id=l)<>prior_due or (select neglect_activity_at from public.leads where id=l)<>prior_activity then raise exception 'Save reset old clock';end if;
 select count(*) into cnt from public.master_audit_log where brand_id=b and action='neglect_days';
 perform public.admin_set_neglect_days(3);
 if (select count(*) from public.master_audit_log where brand_id=b and action='neglect_days')<>cnt then raise exception 'No-op wrote duplicate audit';end if;
 if exists(select 1 from public.master_audit_log where brand_id=b and action='neglect_days' and details ? 'notes') then raise exception 'Notes leaked into audit';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f->>'sales_admin','role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',f->>'sales')::text,true);
 begin perform public.admin_set_neglect_days(3);raise exception 'Sales accepted';exception when insufficient_privilege then null;end;
 insert into public.projects(id,brand_id,name) values(sales_project,(f->>'sales')::uuid,'Sales unchanged');
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,assigned_agent_id,created_at,contacted_at,neglect_activity_at,notes)
 values(sales_lead,(f->>'sales')::uuid,'Sales unchanged','601100008888',sales_project,sales_lead::text,'contacted','contacted',(f->>'sales_admin')::uuid,now()-interval '2 days',now()-interval '1 day',now()-interval '1 day','Sales note');
 perform public.update_lead_notes(sales_lead,'Sales note changed',(select status_revision from public.leads where id=sales_lead));
 if (select neglect_due_at from public.leads where id=sales_lead) is not null then raise exception 'Team Sales got neglected timer';end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',f->>'master','role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',f->>'other')::text,true);
 perform public.admin_set_neglect_days(14);
 if (select neglect_days from public.brands where id=b)<>3 or (select neglect_days from public.brands where id=(f->>'other')::uuid)<>14 then raise exception 'Master modified wrong brand';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',b)::text,true);
 -- No-op notes and technical writes cannot postpone the original deadline.
 perform public.update_lead_notes(l,'Original note',(select status_revision from public.leads where id=l));
 update public.leads set updated_at=clock_timestamp(),neglect_due_at=now()+interval '100 days',neglect_activity_at=now()+interval '100 days' where id=l;
 if (select neglect_due_at from public.leads where id=l)<>prior_due or (select neglect_activity_at from public.leads where id=l)<>prior_activity then raise exception 'Technical/fake deadline reset clock';end if;
 -- A real note change adopts the current 3-day setting.
 perform public.update_lead_notes(n,'Changed note',(select status_revision from public.leads where id=n));
 if (select neglect_due_at-neglect_activity_at from public.leads where id=n)<>interval '72 hours' then raise exception 'Changed note did not adopt 3 days';end if;
 perform public.record_lead_follow_up(fl,0);
 if (select neglect_due_at-neglect_activity_at from public.leads where id=fl)<>interval '72 hours' then raise exception 'Follow-up did not adopt setting';end if;
 perform public.record_lead_follow_up(fl,1);perform public.record_lead_follow_up(fl,2);perform public.record_lead_follow_up(fl,3);
 if (select status from public.leads where id=fl)<>'all_offer_presented' or (select neglect_due_at from public.leads where id=fl) is not null then raise exception 'Follow-up 4 did not stop Neglected';end if;
 -- A later 14-day setting also leaves existing 3-day deadlines alone.
 select neglect_due_at into due from public.leads where id=n;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',adm,'role','authenticated')::text,true);
 perform public.admin_set_neglect_days(14);
 if (select neglect_due_at from public.leads where id=n)<>due then raise exception 'Increasing days changed existing deadline';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 perform public.update_lead_notes(l,'New activity at 14 days',(select status_revision from public.leads where id=l));
 if (select neglect_due_at-neglect_activity_at from public.leads where id=l)<>interval '336 hours' then raise exception '14 day deadline';end if;
 -- Returning to Contacted establishes a fresh deadline; other statuses have none.
 perform public.update_lead_status(gen_random_uuid(),l,'potential',(select assignment_revision from public.leads where id=l),(select status_revision from public.leads where id=l));
 if (select neglect_due_at from public.leads where id=l) is not null then raise exception 'Status exit retained deadline';end if;
 perform public.update_lead_status(gen_random_uuid(),l,'contacted',(select assignment_revision from public.leads where id=l),(select status_revision from public.leads where id=l));
 if (select neglect_due_at-neglect_activity_at from public.leads where id=l)<>interval '336 hours' then raise exception 'Re-entry deadline';end if;
 -- Imports/legacy RPC inserts may rely on tenant_brand_stamp instead of an
 -- explicit brand_id. The deadline trigger must run after that stamp.
 insert into public.leads(id,name,phone,project_id,ingestion_fingerprint,status,queue_state,assigned_agent_id,created_at,contacted_at)
 values(stamped_lead,'Stamped Contacted','601100007777',(f->>'project')::uuid,stamped_lead::text,'contacted','contacted',a,now(),now());
 if not exists(select 1 from public.leads where id=stamped_lead and brand_id=b and neglect_due_at-neglect_activity_at=interval '336 hours') then raise exception 'Brand-stamped insert missed deadline';end if;
 -- Existing retraction lock/revision/exclusion behavior is unchanged.
 perform set_config('request.jwt.claims','{}',true);perform set_config('request.headers','{}',true);
 begin perform public.admin_set_neglect_days(3);raise exception 'Unauthenticated accepted';exception when insufficient_privilege then null;end;
 perform leadlaju_private.retract_neglected_brand(due-interval '1 microsecond');
 if (select neglected_held from public.leads where id=n) then raise exception 'Retracted early';end if;
 perform leadlaju_private.retract_neglected_brand(due);
 if not exists(select 1 from public.leads where id=n and neglected_held and assigned_agent_id is null and neglect_due_at is null) then raise exception 'Exact deadline did not retract';end if;
 perform leadlaju_private.retract_neglected_brand(due);
 if (select count(*) from public.lead_neglect_events where lead_id=n)<>1 then raise exception 'Duplicate retraction';end if;
 if to_regclass('public.leads_neglect_deadline_sweep') is null then raise exception 'Missing deadline index';end if;
end $test$;
select 'PASS prospective 3-14 day settings, legacy backfill, RLS roles/brands, activity resets, immutable deadline, exact sweep threshold and idempotency' result;
rollback;
