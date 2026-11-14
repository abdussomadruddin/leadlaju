-- Disposable local PostgreSQL only. Team Sales stale New lead reassignment.
begin;
select set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true);
create temporary table stale_fixture(data jsonb);
do $setup$
declare s uuid:=gen_random_uuid(); solo uuid:=gen_random_uuid(); ag uuid:=gen_random_uuid();
 a uuid:='00000000-0000-4000-8000-0000000000a1'; b uuid:='00000000-0000-4000-8000-0000000000b2'; c uuid:='00000000-0000-4000-8000-0000000000c3';
 adm uuid:=gen_random_uuid(); solo_a uuid:=gen_random_uuid(); ag_a uuid:=gen_random_uuid(); ag_adm uuid:=gen_random_uuid();
 pr uuid:=gen_random_uuid(); solo_pr uuid:=gen_random_uuid(); ag_pr uuid:=gen_random_uuid();
 stale uuid:=gen_random_uuid(); fresh uuid:=gen_random_uuid(); contacted uuid:=gen_random_uuid(); solo_lead uuid:=gen_random_uuid(); agent_lead uuid:=gen_random_uuid();
begin
 insert into public.brands(id,name,slug,distribution_mode) values(s,'Stale sales','stale-'||s,'team_sales'),(solo,'Solo sales','stale-'||solo,'team_sales');
 insert into public.brands(id,name,slug) values(ag,'Stale agent brand','stale-'||ag);
 insert into public.dispatch_state(brand_id,singleton) values(s,true),(solo,true),(ag,true);
 insert into auth.users(id,email) select id,id||'@test.invalid' from unnest(array[a,b,c,adm,solo_a,ag_a,ag_adm]) id;
 insert into public.profiles(id,brand_id,name,email,role,active,approval_status) values
  (a,s,'Sales A',a||'@test.invalid','agent',true,'approved'),(b,s,'Sales B',b||'@test.invalid','agent',true,'approved'),
  (c,s,'Sales C',c||'@test.invalid','agent',true,'approved'),(adm,s,'Sales Admin',adm||'@test.invalid','admin',true,'approved'),
  (solo_a,solo,'Solo',solo_a||'@test.invalid','agent',true,'approved'),
  (ag_a,ag,'Ejen',ag_a||'@test.invalid','agent',true,'approved'),(ag_adm,ag,'Ejen Admin',ag_adm||'@test.invalid','admin',true,'approved');
 insert into public.projects(id,brand_id,name) values(pr,s,'Stale project'),(solo_pr,solo,'Solo project'),(ag_pr,ag,'Agent project');
 insert into public.agent_project_eligibility(agent_id,brand_id,project_id) values(a,s,pr),(b,s,pr),(c,s,pr),(solo_a,solo,solo_pr),(ag_a,ag,ag_pr);
 perform set_config('leadlaju.worker_brand',s::text,true);
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,assigned_agent_id,received_at,assignment_revision,created_at)
 select id,s,nm,'60110000'||right(id::text,4),pr,id::text,'new','sales_assigned',a,rec,1,rec
 from (values(stale,'Stale',(((now() at time zone 'Asia/Kuala_Lumpur')::date-2)::timestamp+interval '15 hours') at time zone 'Asia/Kuala_Lumpur'),
  (fresh,'Fresh',(((now() at time zone 'Asia/Kuala_Lumpur')::date-1)::timestamp+interval '15 hours') at time zone 'Asia/Kuala_Lumpur')) x(id,nm,rec);
 insert into public.lead_assignments(brand_id,lead_id,agent_id,assignment_revision,assigned_at,expires_at,assignment_mode)
 select s,id,a,1,received_at,null,'team_sales' from public.leads where id in (stale,fresh);
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,assigned_agent_id,received_at,contacted_at,assignment_revision,created_at)
 values(contacted,s,'Contacted','601100001234',pr,contacted::text,'contacted','contacted',a,now()-interval '5 days',now()-interval '4 days',1,now()-interval '5 days');
 insert into public.notification_outbox(brand_id,user_id,lead_id,assignment_revision,notification_type,payload)
 values(s,a,stale,1,'sales_contact_60','{}');
 perform set_config('leadlaju.worker_brand',solo::text,true);
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,assigned_agent_id,received_at,assignment_revision,created_at)
 values(solo_lead,solo,'Solo lead','601100005678',solo_pr,solo_lead::text,'new','sales_assigned',solo_a,now()-interval '10 days',1,now()-interval '10 days');
 perform set_config('leadlaju.worker_brand',ag::text,true);
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,assigned_agent_id,received_at,expires_at,assignment_revision,created_at)
 values(agent_lead,ag,'Agent lead','601100009876',ag_pr,agent_lead::text,'new','active',ag_a,now()-interval '10 days',now()-interval '10 days'+interval '5 minutes',1,now()-interval '10 days');
 perform set_config('leadlaju.worker_brand','',true);
 insert into stale_fixture values(jsonb_build_object('sales',s,'solo',solo,'agent_brand',ag,'a',a,'b',b,'c',c,'admin',adm,'agent_admin',ag_adm,
  'stale',stale,'fresh',fresh,'contacted',contacted,'solo_lead',solo_lead,'agent_lead',agent_lead));
end $setup$;
set constraints all immediate;

do $test$
declare t0 timestamptz:=(((now() at time zone 'Asia/Kuala_Lumpur')::date)::timestamp+interval '9 hours') at time zone 'Asia/Kuala_Lumpur'; f jsonb; s uuid; a uuid; b uuid; c uuid; l public.leads; first_owner uuid; agent_before jsonb; solo_before jsonb; contacted_before jsonb; r jsonb; bad integer; cnt integer;
begin
 select data into f from stale_fixture; s:=(f->>'sales')::uuid; a:=(f->>'a')::uuid; b:=(f->>'b')::uuid; c:=(f->>'c')::uuid;
 select to_jsonb(x) into agent_before from public.leads x where id=(f->>'agent_lead')::uuid;
 select to_jsonb(x) into solo_before from public.leads x where id=(f->>'solo_lead')::uuid;
 select to_jsonb(x) into contacted_before from public.leads x where id=(f->>'contacted')::uuid;
 if (select sales_reassign_days from public.brands where id=s)<>2 then raise exception 'Default is not 2 days';end if;
 if has_function_privilege('anon','public.admin_set_sales_reassign_days(integer)','execute') or has_function_privilege('service_role','public.admin_set_sales_reassign_days(integer)','execute') then raise exception 'Unexpected RPC access';end if;
 if has_function_privilege('authenticated','leadlaju_private.reassign_stale_team_sales()','execute') then raise exception 'Scheduler exposed';end if;
 if not exists(select 1 from cron.job where jobname='leadlaju-team-sales-stale-reassign') then raise exception 'Scheduler missing';end if;

 -- Scheduler: only the 49-hour New lead moves, to B (round robin after nobody).
 if leadlaju_private.reassign_stale_team_sales()<>1 then raise exception 'Expected exactly one reassignment';end if;
 select * into l from public.leads where id=(f->>'stale')::uuid;
 if l.assigned_agent_id=a or l.assigned_agent_id is null or l.status<>'new' or l.queue_state<>'sales_assigned' or l.assignment_revision<>2 or l.received_at<now()-interval '1 minute' then raise exception 'Stale lead not moved correctly: %',to_jsonb(l);end if;
 first_owner:=l.assigned_agent_id;
 if not exists(select 1 from public.lead_assignments where lead_id=l.id and assignment_revision=1 and agent_id=a and outcome='missed') then raise exception 'Old assignment not missed';end if;
 if not exists(select 1 from public.lead_assignments where lead_id=l.id and assignment_revision=2 and agent_id=first_owner and outcome='pending' and assignment_mode='team_sales' and expires_at is null) then raise exception 'New assignment missing';end if;
 if not exists(select 1 from public.notification_outbox where lead_id=l.id and user_id=first_owner and assignment_revision=2 and notification_type='sales_new_lead' and sent_at is null) then raise exception 'New owner not notified';end if;
 if exists(select 1 from public.notification_outbox where lead_id=l.id and user_id=a and sent_at is null) then raise exception 'Old owner reminder not cancelled';end if;
 if not exists(select 1 from public.lead_events where lead_id=l.id and event_type='assigned' and payload->>'reason'='sales_stale_reassign' and (payload->>'previous_owner')::uuid=a) then raise exception 'Event missing';end if;
 if (select assigned_agent_id from public.leads where id=(f->>'fresh')::uuid)<>a then raise exception 'Yesterday lead moved before its 2 calendar days';end if;
 if (select schedule from cron.job where jobname='leadlaju-team-sales-stale-reassign')<>'0 1 * * *' then raise exception 'Not scheduled daily at 09:00 KL';end if;
 if (select to_jsonb(x) from public.leads x where id=(f->>'contacted')::uuid) is distinct from contacted_before then raise exception 'Contacted lead changed';end if;
 if (select to_jsonb(x) from public.leads x where id=(f->>'solo_lead')::uuid) is distinct from solo_before then raise exception 'Single-member lead changed';end if;
 if (select to_jsonb(x) from public.leads x where id=(f->>'agent_lead')::uuid) is distinct from agent_before then raise exception 'Agent-mode lead changed';end if;
 if leadlaju_private.reassign_stale_team_sales()<>0 then raise exception 'Reassigned lead moved again immediately';end if;

 -- Two days later the new owner also missed it: goes to the member who never held it.
 perform set_config('leadlaju.worker_brand',s::text,true);
 cnt:=leadlaju_private.reassign_stale_team_sales_brand(t0+interval '2 days');
 if cnt<>2 then raise exception 'Expected stale and fresh leads to move, got %',cnt;end if;
 select * into l from public.leads where id=(f->>'stale')::uuid;
 if l.assigned_agent_id in (a,first_owner) then raise exception 'Second move did not prefer the member who never held it';end if;
 if (select assigned_agent_id from public.leads where id=(f->>'fresh')::uuid)=a then raise exception 'Fresh lead stayed with A';end if;
 -- All three missed it: it keeps rotating but never stays with the latest owner.
 first_owner:=l.assigned_agent_id;
 perform leadlaju_private.reassign_stale_team_sales_brand(t0+interval '4 days');
 if (select assigned_agent_id from public.leads where id=l.id) in (first_owner) then raise exception 'Rotation kept current owner';end if;
 perform set_config('leadlaju.worker_brand','',true);

 -- Admin setting 1-5, Team Sales only, own brand only.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',s)::text,true);
 begin perform public.admin_set_sales_reassign_days(3);raise exception 'Sales member accepted';exception when insufficient_privilege then null;end;
 begin perform leadlaju_private.reassign_stale_team_sales();raise exception 'User ran scheduler';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f->>'admin','role','authenticated')::text,true);
 foreach bad in array array[0,6,-1] loop
  begin perform public.admin_set_sales_reassign_days(bad);raise exception 'Invalid days accepted';exception when invalid_parameter_value then null;end;
 end loop;
 begin perform public.admin_set_sales_reassign_days(null);raise exception 'Null accepted';exception when invalid_parameter_value then null;end;
 perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',f->>'agent_brand')::text,true);
 begin perform public.admin_set_sales_reassign_days(3);raise exception 'Cross brand accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f->>'agent_admin','role','authenticated')::text,true);
 begin perform public.admin_set_sales_reassign_days(3);raise exception 'Agent brand accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f->>'admin','role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',s)::text,true);
 r:=public.admin_set_sales_reassign_days(5);
 if r->>'sales_reassign_days'<>'5' or (select sales_reassign_days from public.brands where id=s)<>5 then raise exception 'Save failed';end if;
 if (select sales_reassign_days from public.brands where id=(f->>'solo')::uuid)<>2 then raise exception 'Other brand changed';end if;
 select count(*) into cnt from public.master_audit_log where brand_id=s and action='sales_reassign_days';
 perform public.admin_set_sales_reassign_days(5);
 if (select count(*) from public.master_audit_log where brand_id=s and action='sales_reassign_days')<>cnt or cnt<>1 then raise exception 'Audit count wrong';end if;
 perform set_config('request.jwt.claims','{}',true);perform set_config('request.headers','{}',true);
 perform set_config('leadlaju.worker_brand',s::text,true);
 update public.leads set received_at=t0-interval '4 days' where id=(f->>'fresh')::uuid;
 if leadlaju_private.reassign_stale_team_sales_brand(t0)<>0 then raise exception '5-day setting moved a 4-day lead';end if;
 if leadlaju_private.reassign_stale_team_sales_brand(t0+interval '1 day')<>1 then raise exception '5-day setting did not move a 5-day lead';end if;
 -- 1 day = next morning: received late yesterday (23:59 KL) moves today at 09:00.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f->>'admin','role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',s)::text,true);
 perform public.admin_set_sales_reassign_days(1);
 perform set_config('request.jwt.claims','{}',true);perform set_config('request.headers','{}',true);
 update public.leads set received_at=t0-interval '9 hours 1 minute' where id=(f->>'fresh')::uuid;
 update public.leads set received_at=t0-interval '8 hours 59 minutes' where id=(f->>'stale')::uuid;
 if leadlaju_private.reassign_stale_team_sales_brand(t0)<>1 then raise exception '1-day setting should move only yesterday lead';end if;
 if (select received_at from public.leads where id=(f->>'stale')::uuid)<>t0-interval '8 hours 59 minutes' then raise exception 'Today lead moved';end if;
 perform set_config('leadlaju.worker_brand',f->>'agent_brand',true);
 if leadlaju_private.reassign_stale_team_sales_brand(now()+interval '30 days')<>0 then raise exception 'Agent brand swept';end if;
 perform set_config('leadlaju.worker_brand','',true);
end $test$;
select 'PASS Team Sales stale New reassignment: daily 09:00 KL by calendar day, default 2 days, 1-5 admin setting, exclusions, agent mode untouched' result;
rollback;
