-- Disposable local PostgreSQL only. Caller has applied all migrations.
begin;
select set_config('request.jwt.claims','{}',true),set_config('leadlaju.worker_brand','00000000-0000-4000-8000-000000000001',true);
do $test$
declare b uuid:='00000000-0000-4000-8000-000000000001'; a uuid:=extensions.gen_random_uuid();
 admin_id uuid:=extensions.gen_random_uuid(); other_agent uuid:=extensions.gen_random_uuid();
 project uuid:=extensions.gen_random_uuid(); l uuid:=extensions.gen_random_uuid(); l2 uuid:=extensions.gen_random_uuid(); normal uuid:=extensions.gen_random_uuid();
 r jsonb; aid uuid:=extensions.gen_random_uuid(); rev bigint; prior_time timestamptz;
 sales_brand uuid:=extensions.gen_random_uuid(); sales_project uuid:=extensions.gen_random_uuid(); sales_agent uuid:=extensions.gen_random_uuid(); sales_lead uuid:=extensions.gen_random_uuid();
begin
 insert into auth.users(id,email) values(a,a||'@test.invalid'),(admin_id,admin_id||'@test.invalid'),(other_agent,other_agent||'@test.invalid');
 insert into public.profiles(id,brand_id,name,email,role,active,approval_status)
 values(a,b,'Neglect Agent',a||'@test.invalid','agent',true,'approved'),(admin_id,b,'Neglect Admin',admin_id||'@test.invalid','admin',true,'approved'),(other_agent,b,'Replacement',other_agent||'@test.invalid','agent',true,'approved');
 insert into public.projects(id,brand_id,name) values(project,b,'Neglect Fixture');
 insert into public.agent_project_eligibility(brand_id,agent_id,project_id) values(b,a,project),(b,other_agent,project);
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,assigned_agent_id,created_at,contacted_at,follow_up_activity_at,neglect_activity_at,notes)
 values(l,b,'Neglect Fixture','601199990001',project,l::text,'contacted','contacted',a,now()-interval '7 days',now()-interval '6 days',now()-interval '120 hours',now()-interval '120 hours','Original notes'),
 (l2,b,'Neglect Recent','601199990002',project,l2::text,'contacted','contacted',a,now()-interval '7 days',now()-interval '6 days',now()-interval '119 hours',now()-interval '119 hours','Recent notes');
 perform leadlaju_private.retract_neglected_brand(now());
 if not exists(select 1 from public.leads where id=l and neglected_held and assigned_agent_id is null and notes='Original notes') then raise exception '120h retraction failed'; end if;
 if exists(select 1 from public.leads where id=l2 and neglected_held) then raise exception 'Early retraction'; end if;
 perform leadlaju_private.retract_neglected_brand(now());
 if (select count(*) from public.lead_neglect_events where lead_id=l)<>1 then raise exception 'Duplicate sweep'; end if;
 select neglect_activity_at into prior_time from public.leads where id=l2;
 update public.leads set notes=notes,updated_at=now() where id=l2;
 if (select neglect_activity_at from public.leads where id=l2)<>prior_time then raise exception 'No-op reset timer'; end if;
 update public.leads set notes='Changed notes' where id=l2;
 if (select neglect_activity_at from public.leads where id=l2)<=prior_time then raise exception 'Notes failed reset'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 begin perform public.get_neglected_leads_page(); raise exception 'Agent list allowed'; exception when insufficient_privilege then null; end;
 begin perform public.update_lead_notes(l,'Old owner tamper',1); raise exception 'Old owner write allowed';
 exception when insufficient_privilege then null; when raise_exception then if sqlerrm<>'Lead belongs to another agent' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 select assignment_revision into rev from public.leads where id=l;
 r:=public.admin_resolve_neglected(extensions.gen_random_uuid(),jsonb_build_array(jsonb_build_object('id',l,'revision',rev)),'assign',a);
 if (r->'results'->0->>'ok')::boolean then raise exception 'Former owner accepted'; end if;
 r:=public.admin_resolve_neglected(aid,jsonb_build_array(jsonb_build_object('id',l,'revision',rev)),'assign',other_agent);
 if not (r->'results'->0->>'ok')::boolean then raise exception 'Assign failed: %',r; end if;
 if public.admin_resolve_neglected(aid,jsonb_build_array(jsonb_build_object('id',l,'revision',rev)),'assign',other_agent)<>r then raise exception 'Retry result mismatch'; end if;
 if not exists(select 1 from public.leads where id=l and status='new' and not neglected_held and admin_assigned and assigned_agent_id=other_agent and expires_at is null and follow_up_count=0 and notes='Original notes') then raise exception 'New assignment shape'; end if;
 select assignment_revision into rev from public.leads where id=l;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_agent,'role','authenticated')::text,true);
 r:=public.contact_assignment(extensions.gen_random_uuid(),l,rev);
 if not (r->>'ok')::boolean then raise exception 'Manual contact failed: %',r; end if;
 if not exists(select 1 from public.leads where id=l and status='contacted' and neglect_activity_at>=now()) then raise exception 'New timer not started'; end if;
 -- Follow-up resets clock, while the fourth promotes out of Contacted.
 update public.leads set neglect_activity_at=now()-interval '2 days' where id=l;
 perform public.record_lead_follow_up(l,0);
 if (select neglect_activity_at from public.leads where id=l)<now() then raise exception 'Follow-up failed reset'; end if;
 perform public.record_lead_follow_up(l,1);
 perform public.record_lead_follow_up(l,2);
 if (select status from public.leads where id=l)<>'contacted' then raise exception 'Follow-up 3 promoted early'; end if;
 perform public.record_lead_follow_up(l,3);
 if (select status from public.leads where id=l)<>'all_offer_presented' then raise exception 'Follow-up 4 failed promote'; end if;
 -- Retract l2 and assign while the recipient already has a normal active New.
 perform set_config('request.jwt.claims','{}',true);
 update public.leads set neglect_activity_at=now()-interval '120 hours' where id=l2;
 perform leadlaju_private.retract_neglected_brand(now());
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,assigned_agent_id,created_at,received_at,expires_at)
 values(normal,b,'Normal active','601199990003',project,normal::text,'new','active',other_agent,now(),now(),now()+interval '5 minutes');
 insert into public.lead_assignments(brand_id,lead_id,agent_id,assignment_revision,assigned_at,expires_at) values(b,normal,other_agent,0,now(),now()+interval '5 minutes');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 select assignment_revision into rev from public.leads where id=l2;
 r:=public.admin_resolve_neglected(extensions.gen_random_uuid(),jsonb_build_array(jsonb_build_object('id',l2,'revision',rev)),'assign',other_agent);
 if not (r->'results'->0->>'ok')::boolean then raise exception 'Bulk bypass active failed: %',r; end if;
 if (select count(*) from public.leads where assigned_agent_id=other_agent and status='new' and queue_state='active')<>2 then raise exception 'Bulk removed another New'; end if;
 -- Agent brand cannot request another brand using the public list RPC.
 perform set_config('request.headers','{"x-leadlaju-brand":"00000000-0000-4000-8000-000000000002"}',true);
 begin perform public.get_neglected_leads_page(); raise exception 'Cross brand allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.headers','{}',true);
 -- A second neglect excludes both owners forever; rotate waits for another eligible agent.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_agent,'role','authenticated')::text,true);
 select assignment_revision into rev from public.leads where id=l2;
 perform public.contact_assignment(extensions.gen_random_uuid(),l2,rev);
 update public.leads set neglect_activity_at=now()-interval '120 hours' where id=l2;
 perform set_config('request.jwt.claims','{}',true);
 perform leadlaju_private.retract_neglected_brand(now());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 select assignment_revision into rev from public.leads where id=l2;
 r:=public.admin_resolve_neglected(extensions.gen_random_uuid(),jsonb_build_array(jsonb_build_object('id',l2,'revision',rev)),'rotate');
 if not (r->'results'->0->>'ok')::boolean then raise exception 'Rotate failed'; end if;
 perform set_config('request.jwt.claims','{}',true);
 perform leadlaju_private.dispatch_available_leads_agent_brand(now());
 if not exists(select 1 from public.leads where id=l2 and assigned_agent_id is null and queue_state='queued') then raise exception 'Rotated back to excluded owner'; end if;
 if (select count(distinct agent_id) from public.lead_neglect_events where lead_id=l2)<>2 then raise exception 'Prior exclusions lost'; end if;
 -- Export pagination is brand scoped and independent of screen filters.
 with added as (
  insert into public.leads(brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,created_at,neglected_at,neglected_held)
  select b,'Export '||g,'601199990004',project,extensions.gen_random_uuid()::text,'contacted','need_follow_up',now()-interval '7 days',now(),true
  from generate_series(1,501) g returning id
 ) insert into public.lead_neglect_events(brand_id,lead_id,agent_id,assignment_revision,last_activity_at,retracted_at,previous_status,previous_follow_up)
 select b,id,a,0,now()-interval '6 days',now(),'contacted',3 from added;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 r:=public.get_neglected_leads_page(null,'NO MATCH',extensions.gen_random_uuid(),extensions.gen_random_uuid(),true);
 if jsonb_array_length(r->'rows')<>500 or not (r->>'has_more')::boolean then raise exception 'Export first page/filter independence failed'; end if;
 r:=public.get_neglected_leads_page((r->'rows'->499->>'id')::uuid,'',null,null,true);
 if jsonb_array_length(r->'rows')<1 then raise exception 'Export second page empty'; end if;
 if exists(select 1 from jsonb_array_elements(r->'rows') x where (x->>'brand_id')::uuid<>b) then raise exception 'Export brand leak'; end if;
 if has_table_privilege('authenticated','public.lead_neglect_events','select')
  or has_function_privilege('anon','public.get_neglected_leads_page(uuid,text,uuid,uuid,boolean,boolean)','execute')
  or has_function_privilege('authenticated','leadlaju_private.retract_neglected_brand(timestamptz)','execute') then raise exception 'Unexpected runtime privilege'; end if;
 -- Same-aged Team Sales lead remains assigned and untouched.
 perform set_config('request.jwt.claims','{}',true);
 insert into public.brands(id,name,slug,distribution_mode) values(sales_brand,'Neglect Sales Fixture',sales_brand::text,'team_sales');
 insert into auth.users(id,email) values(sales_agent,sales_agent||'@test.invalid');
 insert into public.profiles(id,brand_id,name,email,role,active,approval_status) values(sales_agent,sales_brand,'Sales Fixture',sales_agent||'@test.invalid','agent',true,'approved');
 insert into public.projects(id,brand_id,name) values(sales_project,sales_brand,'Sales Fixture');
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,assigned_agent_id,created_at,neglect_activity_at)
 values(sales_lead,sales_brand,'Sales untouched','601199990005',sales_project,sales_lead::text,'contacted','contacted',sales_agent,now()-interval '7 days',now()-interval '6 days');
 perform set_config('leadlaju.worker_brand',sales_brand::text,true);
 if leadlaju_private.retract_neglected_brand(now())<>0 then raise exception 'Team Sales retracted'; end if;
 if not exists(select 1 from public.leads where id=sales_lead and assigned_agent_id=sales_agent and not neglected_held) then raise exception 'Team Sales altered'; end if;
 perform set_config('test.neglect_lead',l::text,true);
 perform set_config('test.old_agent',a::text,true);
end $test$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.old_agent'),'role','authenticated')::text,true),set_config('request.headers','{}',true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.leads where id=current_setting('test.neglect_lead')::uuid) then raise exception 'Old owner can still read lead through RLS'; end if;
 begin perform public.get_neglected_leads_page(); raise exception 'Agent invoked admin list'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
