-- Supabase postgres is not a superuser: the new definer owner needs CREATE
-- while functions are transferred. Revoke it before this transaction commits.
grant create on schema public,leadlaju_private to leadlaju_tenant_executor;
alter table public.brands add column distribution_mode text not null default 'agent'
  check (distribution_mode in ('agent','team_sales'));
alter table public.lead_assignments add column assignment_mode text not null default 'agent'
  check (assignment_mode in ('agent','team_sales'));
alter table public.lead_assignments alter column expires_at drop not null;
alter table public.lead_assignments add constraint assignment_mode_expiry_shape check
 ((assignment_mode='agent' and expires_at is not null) or (assignment_mode='team_sales' and expires_at is null));
drop index public.one_pending_assignment_per_agent;
create unique index one_pending_assignment_per_agent on public.lead_assignments(agent_id)
 where outcome='pending' and assignment_mode='agent';
alter table public.leads add constraint sales_assignment_shape check
 (queue_state<>'sales_assigned' or (status='new' and assigned_agent_id is not null and received_at is not null and expires_at is null));
alter table public.project_dispatch_state add column sales_last_agent_id uuid;
create index sales_pending_dispatch on public.leads(brand_id,project_id,created_at,id)
 where status='new' and queue_state='queued' and assigned_agent_id is null;

alter function leadlaju_private.reconcile_pending_assignment_before_insert() rename to reconcile_pending_agent_assignment_before_insert;
create function leadlaju_private.reconcile_pending_assignment_before_insert() returns trigger
 language plpgsql security definer set search_path='' as $$ begin
 if new.assignment_mode='agent' then
   update public.lead_assignments la set outcome='missed',resolved_at=coalesce(la.resolved_at,now())
     where la.assignment_mode='agent' and la.outcome='pending' and (la.agent_id=new.agent_id or la.lead_id=new.lead_id)
       and not exists(select 1 from public.leads l where l.id=la.lead_id and l.status='new' and l.queue_state='active'
         and l.assigned_agent_id=la.agent_id and l.assignment_revision=la.assignment_revision);
 end if;
 return new;
end $$;
alter function leadlaju_private.reconcile_pending_assignment_before_insert() owner to leadlaju_tenant_executor;
drop trigger reconcile_pending_assignment_before_insert on public.lead_assignments;
create trigger reconcile_pending_assignment_before_insert before insert on public.lead_assignments
 for each row execute function leadlaju_private.reconcile_pending_assignment_before_insert();
revoke all on function leadlaju_private.reconcile_pending_assignment_before_insert() from public,anon,authenticated;

create function leadlaju_private.distribution_mode() returns text
 language sql stable security definer set search_path='' as $$
 select distribution_mode from public.brands where id=leadlaju_private.request_brand();
$$;
create function leadlaju_private.guard_distribution_mode() returns trigger
 language plpgsql security definer set search_path='' as $$
declare mode text;
begin
 if tg_table_name='brands' then
   if new.distribution_mode is distinct from old.distribution_mode then raise exception 'Distribution mode is immutable'; end if;
 else
   select distribution_mode into mode from public.brands where id=coalesce(new.brand_id,leadlaju_private.request_brand());
   if tg_table_name='lead_assignments' then
     if new.assignment_mode is distinct from mode then raise exception 'Assignment mode does not match brand'; end if;
   elsif tg_table_name='leads' then
     if (new.queue_state='sales_assigned' and mode<>'team_sales') or (new.queue_state='active' and mode<>'agent') then raise exception 'Queue mode does not match brand'; end if;
   end if;
 end if;
 return new;
end $$;
create trigger immutable_distribution_mode before update on public.brands for each row execute function leadlaju_private.guard_distribution_mode();
create trigger assignment_distribution_guard before insert or update on public.lead_assignments for each row execute function leadlaju_private.guard_distribution_mode();
create trigger lead_distribution_guard before insert or update on public.leads for each row execute function leadlaju_private.guard_distribution_mode();

-- Rename, do not rewrite, the operational Ejen algorithm.
alter function leadlaju_private.dispatch_available_leads_brand(timestamptz) rename to dispatch_available_leads_agent_brand;
alter function leadlaju_private.expire_assignments_brand(timestamptz) rename to expire_assignments_agent_brand;

create function leadlaju_private.dispatch_team_sales(p_now timestamptz default now()) returns integer
 language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand(); pr record; l public.leads; recipient uuid; last_agent uuid; aid uuid; total integer:=0;
begin
 if bid is null or leadlaju_private.distribution_mode()<>'team_sales' then raise exception 'Active Team Sales brand required' using errcode='42501'; end if;
 -- Same brand lock order as the legacy dispatcher; project cursor and assignments
 -- commit together. Duplicate ingestion never reaches this loop twice for a lead.
 perform 1 from public.dispatch_state where brand_id=bid and singleton for update;
 for pr in select id from public.projects where brand_id=bid and active order by id loop
   insert into public.project_dispatch_state(brand_id,project_id) values(bid,pr.id) on conflict(project_id) do nothing;
   select sales_last_agent_id into last_agent from public.project_dispatch_state where project_id=pr.id and brand_id=bid for update;
   for l in select * from public.leads where brand_id=bid and project_id=pr.id and status='new' and queue_state='queued'
     and assigned_agent_id is null order by created_at,id for update loop
     recipient:=null;
     select p.id into recipient from public.profiles p join public.agent_project_eligibility e on e.agent_id=p.id and e.brand_id=p.brand_id
       where p.brand_id=bid and e.project_id=pr.id and p.role='agent' and p.active and p.approval_status='approved'
       order by case when last_agent is null or p.id>last_agent then 0 else 1 end,p.id limit 1;
     if recipient is null then exit; end if;
     update public.leads set assigned_agent_id=recipient,received_at=p_now,expires_at=null,queued_at=null,queue_state='sales_assigned',
       assignment_revision=assignment_revision+1,updated_at=p_now where id=l.id returning assignment_revision into l.assignment_revision;
     insert into public.lead_assignments(brand_id,lead_id,agent_id,assignment_revision,assigned_at,expires_at,assignment_mode)
       values(bid,l.id,recipient,l.assignment_revision,p_now,null,'team_sales') returning id into aid;
     insert into public.lead_events(brand_id,lead_id,assignment_id,event_type,assignment_revision)
       values(bid,l.id,aid,'assigned',l.assignment_revision);
     insert into public.notification_outbox(brand_id,user_id,lead_id,assignment_revision,notification_type,payload)
       values(bid,recipient,l.id,l.assignment_revision,'sales_new_lead',jsonb_build_object('lead_id',l.id,'assignment_revision',l.assignment_revision)) on conflict do nothing;
     last_agent:=recipient; total:=total+1;
     update public.project_dispatch_state set sales_last_agent_id=recipient,updated_at=p_now where project_id=pr.id and brand_id=bid;
   end loop;
 end loop;
 return total;
end $$;
alter function leadlaju_private.dispatch_team_sales(timestamptz) owner to leadlaju_tenant_executor;
create function leadlaju_private.dispatch_available_leads_brand(p_now timestamptz default now()) returns integer
 language plpgsql security definer set search_path='' as $$ begin
 if leadlaju_private.distribution_mode()='team_sales' then return leadlaju_private.dispatch_team_sales(p_now); end if;
 return leadlaju_private.dispatch_available_leads_agent_brand(p_now);
end $$;
create function leadlaju_private.expire_assignments_brand(p_now timestamptz default now()) returns integer
 language plpgsql security definer set search_path='' as $$ begin
 if leadlaju_private.distribution_mode()='team_sales' then return 0; end if;
 return leadlaju_private.expire_assignments_agent_brand(p_now);
end $$;
alter function leadlaju_private.dispatch_available_leads_brand(timestamptz) owner to leadlaju_tenant_executor;
alter function leadlaju_private.expire_assignments_brand(timestamptz) owner to leadlaju_tenant_executor;

-- Deferred dispatch observes the final eligibility set, not the intermediate
-- delete/reinsert state of an Admin update. Service-role approval also uses it.
create function leadlaju_private.sales_membership_dispatch() returns trigger
 language plpgsql security definer set search_path='' as $$
declare previous_headers text:=current_setting('request.headers',true); previous_worker text:=current_setting('leadlaju.worker_brand',true); bid uuid:=new.brand_id;
begin
 if exists(select 1 from public.brands where id=bid and active and distribution_mode='team_sales') then
   if auth.uid() is not null and not leadlaju_private.is_master() and bid is distinct from leadlaju_private.request_brand() then raise exception 'Brand access denied'; end if;
   perform set_config('request.headers',jsonb_build_object('x-leadlaju-brand',bid)::text,true);
   perform set_config('leadlaju.worker_brand',bid::text,true);
   perform leadlaju_private.dispatch_team_sales(now());
   perform set_config('request.headers',coalesce(previous_headers,''),true);
   perform set_config('leadlaju.worker_brand',coalesce(previous_worker,''),true);
 end if;
 return null;
end $$;
create constraint trigger sales_profile_dispatch after insert on public.profiles deferrable initially deferred
 for each row when (new.role='agent' and new.active and new.approval_status='approved') execute function leadlaju_private.sales_membership_dispatch();
create constraint trigger sales_profile_activation_dispatch after update on public.profiles deferrable initially deferred
 for each row when (new.role='agent' and new.active and new.approval_status='approved' and
   (old.active is distinct from new.active or old.approval_status is distinct from new.approval_status)) execute function leadlaju_private.sales_membership_dispatch();
create constraint trigger sales_eligibility_dispatch after insert on public.agent_project_eligibility deferrable initially deferred
 for each row execute function leadlaju_private.sales_membership_dispatch();
create constraint trigger sales_project_dispatch after update on public.projects deferrable initially deferred
 for each row when (new.active) execute function leadlaju_private.sales_membership_dispatch();

create function public.team_sales_contact(p_lead_id uuid,p_channel text,p_action_id uuid,p_assignment_revision bigint) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand(); l public.leads; a public.action_requests; result jsonb; assignment_id uuid;
begin
 if bid is null or leadlaju_private.distribution_mode()<>'team_sales' or p_channel is null or p_channel not in ('call','whatsapp') or p_action_id is null or p_assignment_revision is null then raise exception 'Invalid Team Sales action' using errcode='42501'; end if;
 select * into l from public.leads where id=p_lead_id and brand_id=bid for update;
 if not found or (l.assigned_agent_id is distinct from auth.uid() and not leadlaju_private.is_admin(auth.uid()))
   or not exists(select 1 from public.profiles where id=auth.uid() and active and approval_status='approved')
   or l.assigned_agent_id is null or l.assignment_revision<>p_assignment_revision then raise exception 'Lead access or revision denied' using errcode='42501'; end if;
 select * into a from public.action_requests where action_id=p_action_id;
 if found then
   if a.actor_id<>auth.uid() or a.lead_id<>l.id or a.assignment_revision<>p_assignment_revision or a.action_type<>'team_sales_contact' then raise exception 'Action identity conflict'; end if;
   return a.result;
 end if;
 select * into a from public.action_requests where lead_id=l.id and assignment_revision=p_assignment_revision and action_type='team_sales_contact';
 if found then return a.result; end if;
 if l.status='new' then
   if l.queue_state<>'sales_assigned' then raise exception 'Lead is not assigned to Team Sales'; end if;
   update public.leads set status='contacted',queue_state='contacted',contacted_at=now(),response_ms=null,
     status_revision=status_revision+1,status_updated_at=now(),updated_at=now() where id=l.id returning * into l;
   update public.lead_assignments set outcome='contacted',resolved_at=now() where lead_id=l.id and assignment_revision=p_assignment_revision and assignment_mode='team_sales' and outcome='pending' returning id into assignment_id;
   update public.profiles set leads_handled=leads_handled+1,updated_at=now() where id=l.assigned_agent_id;
   insert into public.lead_events(brand_id,lead_id,assignment_id,actor_id,event_type,assignment_revision,payload)
     values(bid,l.id,assignment_id,auth.uid(),'sales_contact',p_assignment_revision,jsonb_build_object('channel',p_channel,'action_id',p_action_id));
 end if;
 result:=jsonb_build_object('ok',true,'lead',to_jsonb(l),'channel',p_channel,'assignment_revision',p_assignment_revision);
 insert into public.action_requests(brand_id,action_id,actor_id,lead_id,assignment_revision,action_type,state,result)
   values(bid,p_action_id,auth.uid(),l.id,p_assignment_revision,'team_sales_contact','accepted',result);
 return result;
end $$;
alter function public.team_sales_contact(uuid,text,uuid,bigint) owner to leadlaju_tenant_executor;
revoke all on function public.team_sales_contact(uuid,text,uuid,bigint) from public,anon;
grant execute on function public.team_sales_contact(uuid,text,uuid,bigint) to authenticated;

-- Keep the original report calculations and authorization. Remove the SLA data
-- itself for Team Sales, not just its visible label.
alter function public.get_agent_performance_report(date,date,uuid,uuid) rename to get_agent_performance_report_base;
revoke all on function public.get_agent_performance_report_base(date,date,uuid,uuid) from public,anon,authenticated;
create function public.get_agent_performance_report(p_from date,p_to date,p_project_id uuid default null,p_agent_id uuid default null)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; mode text:=leadlaju_private.distribution_mode(); key text;
begin
 result:=public.get_agent_performance_report_base(p_from,p_to,p_project_id,p_agent_id);
 if mode='team_sales' then
   foreach key in array array['rows','weeks'] loop
     result:=jsonb_set(result,array[key],coalesce((select jsonb_agg(x-'within_five') from jsonb_array_elements(result->key) x),'[]'));
   end loop;
 end if;
 return result||jsonb_build_object('distribution_mode',mode,'response_sla_applicable',mode='agent');
end $$;
alter function public.get_agent_performance_report(date,date,uuid,uuid) owner to leadlaju_tenant_executor;
revoke all on function public.get_agent_performance_report(date,date,uuid,uuid) from public,anon;
grant execute on function public.get_agent_performance_report(date,date,uuid,uuid) to authenticated;

-- Patch only mode selection into Master management; retain its audit and
-- deactivation safeguards. Immutable trigger protects every write path.
do $$ declare definition text; anchor text; begin
 definition:=pg_get_functiondef('public.master_manage_brand(text,jsonb)'::regprocedure);
 anchor:='insert into public.brands(name,slug) values(trim(p_brand->>''name''),lower(trim(p_brand->>''slug'')))';
 if strpos(definition,anchor)=0 then raise exception 'Master create anchor missing'; end if;
 definition:=replace(definition,anchor,$patch$if coalesce(p_brand->>'distribution_mode','') not in ('agent','team_sales') then raise exception 'Choose a distribution mode'; end if;
   insert into public.brands(name,slug,distribution_mode) values(trim(p_brand->>'name'),lower(trim(p_brand->>'slug')),p_brand->>'distribution_mode')$patch$);
 definition:=replace(definition,'elsif p_action=''update'' then',$patch$elsif p_action='update' then
   if p_brand ? 'distribution_mode' then raise exception 'Distribution mode is immutable'; end if;$patch$);
 execute definition;
end $$;

-- Timed Ejen actions are unavailable in Team Sales even through direct RPCs.
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in ('contact_assignment','set_agent_availability','set_agent_lead_readiness','set_lead_readiness','admin_set_agent_lead_readiness','admin_set_all_agent_lead_readiness') loop
   definition:=pg_get_functiondef(f.oid);
   definition:=regexp_replace(definition,'\mbegin\M',$guard$begin
 if leadlaju_private.distribution_mode()='team_sales' then raise exception 'Timed Ejen actions are not available in Team Sales' using errcode='42501'; end if;$guard$,'i');
   execute definition;
 end loop;
end $$;
revoke all on function leadlaju_private.distribution_mode(),leadlaju_private.guard_distribution_mode(),leadlaju_private.dispatch_team_sales(timestamptz),leadlaju_private.dispatch_available_leads_brand(timestamptz),leadlaju_private.expire_assignments_brand(timestamptz),leadlaju_private.sales_membership_dispatch() from public,anon,authenticated;
grant execute on function leadlaju_private.distribution_mode(),leadlaju_private.dispatch_team_sales(timestamptz),leadlaju_private.dispatch_available_leads_brand(timestamptz),leadlaju_private.expire_assignments_brand(timestamptz),public.get_agent_performance_report_base(date,date,uuid,uuid) to leadlaju_tenant_executor;
revoke create on schema public,leadlaju_private from leadlaju_tenant_executor;
