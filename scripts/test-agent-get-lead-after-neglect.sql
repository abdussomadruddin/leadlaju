-- Disposable local PostgreSQL only. Exercise authenticated GET LEAD after the
-- Neglected Lead trigger is installed, not only the trusted scheduler path.
begin;
select set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true);
do $test$
declare b uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); peer uuid:=gen_random_uuid();
 project uuid:=gen_random_uuid(); l uuid:=gen_random_uuid(); l2 uuid:=gen_random_uuid(); spare uuid:=gen_random_uuid();
 r jsonb; peer_lead public.leads; own_lead public.leads;
begin
 insert into public.brands(id,name,slug) values(b,'GET Fixture','get-'||b::text);
 perform set_config('leadlaju.worker_brand',b::text,true);
 insert into public.dispatch_state(brand_id,singleton) values(b,true);
 insert into auth.users(id,email) values(a,a||'@test.invalid'),(peer,peer||'@test.invalid');
 insert into public.profiles(id,brand_id,name,email,role,active,approval_status)
 values(a,b,'GET Fixture',a||'@test.invalid','agent',true,'approved'),
 (peer,b,'GET Peer',peer||'@test.invalid','agent',true,'approved');
 insert into public.projects(id,brand_id,name) values(project,b,'GET Fixture');
 insert into public.agent_project_eligibility(brand_id,agent_id,project_id) values(b,a,project),(b,peer,project);
 insert into public.agent_availability(brand_id,agent_id,lead_ready,notification_ready,presence_lease_until)
 values(b,a,false,true,now()+interval '1 hour'),(b,peer,true,true,now()+interval '1 hour');
 insert into public.push_subscriptions(brand_id,user_id,endpoint,p256dh,auth,user_agent,active)
 values(b,a,'https://test.invalid/'||a,'fixture','fixture','iPhone Safari',true),
 (b,peer,'https://test.invalid/'||peer,'fixture','fixture','iPhone Safari',true);
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,created_at)
 values(l,b,'GET First','601199990080',project,l::text,'new','queued',now()-interval '2 minutes'),
 (l2,b,'GET Second','601199990081',project,l2::text,'new','queued',now()-interval '1 minute');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',b)::text,true);
 r:=public.set_agent_availability(true,true);
 if not (r->>'ok')::boolean or not (r->>'lead_ready')::boolean then raise exception 'GET LEAD failed: %',r; end if;
 select * into own_lead from public.leads where id in(l,l2) and assigned_agent_id=a;
 select * into peer_lead from public.leads where id in(l,l2) and assigned_agent_id=peer;
 if own_lead.id is null or peer_lead.id is null then raise exception 'Authenticated dispatch skipped owner or peer'; end if;
 if (select count(*) from public.lead_assignments where lead_id in(l,l2))<>2
   or (select count(*) from public.notification_outbox where lead_id in(l,l2) and notification_type='new_lead')<>2 then
   raise exception 'GET assignment/outbox not exactly once';
 end if;
 r:=public.set_agent_availability(true,true);
 if not (r->>'ok')::boolean or (select count(*) from public.lead_assignments where lead_id in(l,l2))<>2 then raise exception 'Repeated GET duplicated assignment'; end if;
 begin perform public.update_lead_notes(peer_lead.id,'Peer tamper',peer_lead.status_revision);raise exception 'Peer edit allowed';
 exception when insufficient_privilege then null;when raise_exception then if sqlerrm not in('Lead belongs to another agent','Lead not available') then raise;end if;end;
 begin r:=public.update_lead_status(gen_random_uuid(),peer_lead.id,'potential',peer_lead.assignment_revision,peer_lead.status_revision);
 if (r->>'ok')::boolean then raise exception 'Peer status edit allowed';end if;
 exception when insufficient_privilege then null;when raise_exception then if sqlerrm not in('Lead belongs to another agent','Lead not available') then raise;end if;end;
 begin r:=public.contact_assignment(gen_random_uuid(),peer_lead.id,peer_lead.assignment_revision);
 if (r->>'ok')::boolean then raise exception 'Peer contact allowed';end if;
 exception when insufficient_privilege then null;when raise_exception then if sqlerrm not in('Lead belongs to another agent','Lead not available') then raise;end if;end;
 -- Even a structurally valid assignment must not carry a non-owner note edit.
 perform set_config('request.jwt.claims','{}',true);
 insert into public.leads(id,brand_id,name,phone,project_id,ingestion_fingerprint,status,queue_state,created_at)
 values(spare,b,'GET Spare','601199990082',project,spare::text,'new','queued',now());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 begin
  update public.leads set assigned_agent_id=peer,queue_state='active',assignment_revision=assignment_revision+1,
    received_at=now(),expires_at=now()+interval '5 minutes',notes='Injected note' where id=spare;
  raise exception 'Assignment payload tamper allowed';
 exception when insufficient_privilege then null;end;
 begin
  update public.leads set assigned_agent_id=peer,queue_state='active',assignment_revision=assignment_revision+1,
    received_at=now(),expires_at=null,queued_at=null where id=spare;
  raise exception 'NULL expiry bypassed non-owner guard';
 exception when insufficient_privilege then null;end;
 -- Expiry invoked within an authenticated operation can retract another owner's
 -- elapsed New assignment. STOP its recipient first to prevent immediate retry.
 perform set_config('request.jwt.claims','{}',true);
 update public.agent_availability set lead_ready=false where agent_id=peer;
 update public.leads set expires_at=now()-interval '1 second' where id=peer_lead.id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 perform leadlaju_private.expire_assignments(now());
 if not exists(select 1 from public.leads where id=peer_lead.id and assigned_agent_id is null and queue_state='queued'
   and assignment_revision=peer_lead.assignment_revision+1 and notes=peer_lead.notes) then raise exception 'Authenticated expiry failed';end if;
 if has_table_privilege('authenticated','public.leads','UPDATE') then raise exception 'Direct authenticated update granted'; end if;
end $test$;
rollback;
