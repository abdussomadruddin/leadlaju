-- Agent-only recovery queue. Applying this migration is the activation boundary.
alter table public.leads add column neglected_at timestamptz,
 add column neglected_held boolean not null default false,
 add column neglect_activity_at timestamptz,
 add column admin_assigned boolean not null default false;
alter table public.lead_assignments add column admin_assigned boolean not null default false;
alter table public.leads drop constraint lead_runtime_shape;
alter table public.leads add constraint lead_runtime_shape check (
 queue_state<>'active' or (status='new' and assigned_agent_id is not null and received_at is not null and (expires_at is not null or admin_assigned)));
drop index public.one_active_lead_per_agent;
create unique index one_active_lead_per_agent on public.leads(assigned_agent_id)
 where status='new' and queue_state='active' and not admin_assigned;
drop index public.one_pending_assignment_per_agent;
create unique index one_pending_assignment_per_agent on public.lead_assignments(agent_id)
 where outcome='pending' and assignment_mode='agent' and not admin_assigned;
create index leads_neglect_sweep on public.leads(brand_id,neglect_activity_at,id)
 where status='contacted' and assigned_agent_id is not null and not neglected_held;
create index leads_neglected_pool on public.leads(brand_id,id) where neglected_held;

create table public.lead_neglect_events (
 id uuid primary key default extensions.gen_random_uuid(),
 brand_id uuid not null references public.brands(id),
 lead_id uuid not null, agent_id uuid not null,
 assignment_revision bigint not null, last_activity_at timestamptz not null,
 retracted_at timestamptz not null, previous_status text not null,
 previous_follow_up integer not null,
 foreign key(brand_id,lead_id) references public.leads(brand_id,id) on delete cascade,
 foreign key(brand_id,agent_id) references public.profiles(brand_id,id),
 unique(brand_id,lead_id,assignment_revision)
);
create index lead_neglect_exclusions on public.lead_neglect_events(brand_id,lead_id,agent_id);
create table public.neglect_action_results (
 brand_id uuid not null references public.brands(id), action_id uuid not null,
 actor_id uuid not null references public.profiles(id), request jsonb not null,result jsonb not null,
 primary key(brand_id,action_id)
);
alter table public.lead_neglect_events enable row level security;
alter table public.neglect_action_results enable row level security;
revoke all on public.lead_neglect_events,public.neglect_action_results from public,anon,authenticated;
grant select,insert on public.lead_neglect_events,public.neglect_action_results to leadlaju_tenant_executor;
create policy neglect_tenant on public.lead_neglect_events to leadlaju_tenant_executor
 using(brand_id=leadlaju_private.request_brand()) with check(brand_id=leadlaju_private.request_brand());
create policy neglect_actions_tenant on public.neglect_action_results to leadlaju_tenant_executor
 using(brand_id=leadlaju_private.request_brand()) with check(brand_id=leadlaju_private.request_brand());

-- Use business activity, never generic updated_at. Existing activity is maintained
-- by the note/status trigger and the successful follow-up RPC.
update public.leads l set neglect_activity_at=coalesce(l.follow_up_activity_at,l.contacted_at,l.status_updated_at)
 from public.brands b where b.id=l.brand_id and b.distribution_mode='agent' and l.status='contacted';

create function leadlaju_private.track_neglect_activity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.brands where id=new.brand_id and distribution_mode='agent') then return new; end if;
 if auth.uid() is not null and not leadlaju_private.is_admin(auth.uid()) and old.assigned_agent_id is distinct from auth.uid() then
   raise exception 'Lead bukan milik ejen ini' using errcode='42501';
 end if;
 if new.assigned_agent_id is not null and exists(select 1 from public.lead_neglect_events
   where brand_id=new.brand_id and lead_id=new.id and agent_id=new.assigned_agent_id) then
   raise exception 'Ejen ini pernah mengabaikan lead ini dan tidak boleh menerimanya semula';
 end if;
 if old.neglected_held and new.neglected_held and
   (new.status is distinct from old.status or new.assigned_agent_id is distinct from old.assigned_agent_id) then
   raise exception 'Gunakan tindakan Neglected Lead untuk melepaskan lead ini';
 end if;
 if new.neglected_held then new.neglect_activity_at:=null;
 elsif new.status='contacted' then
   if old.status is distinct from new.status or old.notes is distinct from new.notes
     or (new.follow_up_count>old.follow_up_count and new.follow_up_count<=6) then
     new.neglect_activity_at:=clock_timestamp();
   end if;
 else new.neglect_activity_at:=null;
 end if;
 return new;
end $$;
create trigger leads_track_neglect before update on public.leads for each row
 execute function leadlaju_private.track_neglect_activity();

create function leadlaju_private.retract_neglected_brand(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare b uuid:=leadlaju_private.request_brand(); l public.leads; n integer:=0;
begin
 if not exists(select 1 from public.brands where id=b and active and distribution_mode='agent') then return 0; end if;
 -- Same ordering as dispatcher and GET LEAD: dispatch state, then lead rows.
 perform 1 from public.dispatch_state where brand_id=b for update;
 for l in select * from public.leads where brand_id=b and status='contacted'
  and assigned_agent_id is not null and not neglected_held and neglect_activity_at<=p_now-interval '120 hours'
  order by neglect_activity_at,id limit 200 for update skip locked loop
  insert into public.lead_neglect_events(brand_id,lead_id,agent_id,assignment_revision,last_activity_at,retracted_at,previous_status,previous_follow_up)
   values(b,l.id,l.assigned_agent_id,l.assignment_revision,l.neglect_activity_at,p_now,l.status,l.follow_up_count)
   on conflict do nothing;
  update public.notification_outbox set sent_at=p_now,claimed_at=null,last_error='Cancelled: neglected assignment retracted'
   where brand_id=b and lead_id=l.id and assignment_revision=l.assignment_revision and sent_at is null;
  update public.leads set neglected_at=p_now,neglected_held=true,admin_assigned=false,
   assigned_agent_id=null,expires_at=null,received_at=null,queued_at=null,
   queue_state='need_follow_up',assignment_revision=assignment_revision+1,
   status_revision=status_revision+1,updated_at=p_now where id=l.id and brand_id=b;
  insert into public.lead_events(brand_id,lead_id,event_type,assignment_revision,status_revision,payload)
   values(b,l.id,'neglected_retracted',l.assignment_revision+1,l.status_revision+1,
    jsonb_build_object('previous_owner',l.assigned_agent_id,'last_activity_at',l.neglect_activity_at,'follow_up_count',l.follow_up_count));
  perform realtime.send(jsonb_build_object('leadId',l.id,'brandId',b,'revision',l.assignment_revision+1),
   'assignment_revoked','user:'||l.assigned_agent_id::text,true);
  n:=n+1;
 end loop;
 if n>0 then
  perform leadlaju_private.refresh_agent_due_gate(p_now);
  perform realtime.send(jsonb_build_object('brandId',b),'neglected_changed','brand:'||b::text||':operations',true);
 end if;
 return n;
end $$;

create function leadlaju_private.assert_neglect_admin() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare b uuid:=leadlaju_private.request_brand();
begin
 if auth.uid() is null or not leadlaju_private.is_admin(auth.uid()) or
 not exists(select 1 from public.brands where id=b and active and distribution_mode='agent') then
 raise exception 'Active Agent brand administrator required' using errcode='42501'; end if;
 return b;
end $$;

create function public.get_neglected_leads_page(p_after uuid default null,p_search text default '',p_project uuid default null,p_agent uuid default null,p_export boolean default false,p_count_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b uuid:=leadlaju_private.assert_neglect_admin(); rows jsonb; total bigint; page_size integer:=case when p_export then 500 else 50 end;
begin
 select count(*) into total from public.leads where brand_id=b and neglected_held;
 if p_count_only then return jsonb_build_object('brand_id',b,'total',total,'rows','[]'::jsonb,'has_more',false); end if;
 with page as materialized (
  select l.*,p.name as project,old.agent_id as previous_agent_id,owner.name as previous_owner,
   old.last_activity_at,old.previous_status,old.previous_follow_up
  from public.leads l join public.projects p on p.id=l.project_id and p.brand_id=b
  join lateral(select e.* from public.lead_neglect_events e where e.brand_id=b and e.lead_id=l.id order by e.assignment_revision desc limit 1) old on true
  join public.profiles owner on owner.id=old.agent_id and owner.brand_id=b
  where l.brand_id=b and l.neglected_held and (p_after is null or l.id>p_after)
   and (p_export or ((p_project is null or l.project_id=p_project) and (p_agent is null or old.agent_id=p_agent)
    and (coalesce(p_search,'')='' or l.name ilike '%'||p_search||'%' or l.phone ilike '%'||p_search||'%')))
  order by l.id limit page_size+1
 ) select jsonb_build_object('brand_id',b,'total',total,'has_more',(select count(*)>page_size from page),
  'rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (select * from page order by id limit page_size) x),'[]'::jsonb)) into rows;
 return rows;
end $$;

create function public.admin_resolve_neglected(p_action_id uuid,p_items jsonb,p_mode text,p_agent uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=leadlaju_private.assert_neglect_admin(); item jsonb; l public.leads;
 request jsonb:=jsonb_build_object('items',p_items,'mode',p_mode,'agent',p_agent);
 prior public.neglect_action_results; results jsonb:='[]'; err text;
begin
 if p_action_id is null or p_mode is null or p_mode not in ('assign','rotate') or p_items is null or jsonb_typeof(p_items)<>'array'
  or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Invalid bulk request'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(b::text||p_action_id::text,0));
 select * into prior from public.neglect_action_results where brand_id=b and action_id=p_action_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.request<>request then raise exception 'Action ID reused'; end if;
  return prior.result;
 end if;
 perform 1 from public.dispatch_state where brand_id=b for update;
 -- Deterministic row order; each item uses its own subtransaction.
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  begin
   select * into l from public.leads where id=(item->>'id')::uuid and brand_id=b for update;
   if not found or not l.neglected_held or l.assignment_revision<>(item->>'revision')::bigint
    or item->>'revision' is null then raise exception 'Lead sudah berubah. Muat semula.'; end if;
   if p_mode='assign' then
    if p_agent is null or not exists(select 1 from public.profiles p
     join public.agent_project_eligibility e on e.agent_id=p.id and e.brand_id=b and e.project_id=l.project_id
     join public.projects pr on pr.id=e.project_id and pr.brand_id=b and pr.active
     where p.id=p_agent and p.brand_id=b and p.role='agent' and p.active and p.approval_status='approved') then
     raise exception 'Ejen tidak aktif atau projek tidak sepadan'; end if;
    if exists(select 1 from public.lead_neglect_events where brand_id=b and lead_id=l.id and agent_id=p_agent) then
     raise exception 'Ejen ini pernah mengabaikan lead ini'; end if;
   end if;
   update public.leads set neglected_held=false,status='new',follow_up_count=0,contacted_at=null,response_ms=null,
    admin_assigned=(p_mode='assign'),assigned_agent_id=case when p_mode='assign' then p_agent else null end,
    queue_state=case when p_mode='assign' then 'active'::public.leadlaju_queue_state else 'queued'::public.leadlaju_queue_state end,
    received_at=case when p_mode='assign' then now() else null end,expires_at=null,
    queued_at=case when p_mode='rotate' then now() else null end,pass_count=0,retry_after_cycle=0,
    assignment_revision=assignment_revision+1,status_revision=status_revision+1,status_updated_at=now(),updated_at=now()
    where id=l.id returning * into l;
   if p_mode='assign' then
    insert into public.lead_assignments(brand_id,lead_id,agent_id,assignment_revision,assigned_at,expires_at,admin_assigned)
     values(b,l.id,p_agent,l.assignment_revision,now(),'infinity',true);
    insert into public.notification_outbox(brand_id,user_id,lead_id,assignment_revision,notification_type,payload)
     values(b,p_agent,l.id,l.assignment_revision,'new_lead',jsonb_build_object('lead_id',l.id,'assignment_revision',l.assignment_revision)) on conflict do nothing;
   end if;
   insert into public.lead_events(brand_id,lead_id,actor_id,event_type,assignment_revision,status_revision,payload)
    values(b,l.id,auth.uid(),'neglected_'||p_mode,l.assignment_revision,l.status_revision,jsonb_build_object('owner',p_agent));
   results:=results||jsonb_build_array(jsonb_build_object('id',l.id,'ok',true));
  exception when others then
   get stacked diagnostics err=message_text;
   results:=results||jsonb_build_array(jsonb_build_object('id',item->>'id','ok',false,'error',err));
  end;
 end loop;
 insert into public.neglect_action_results values(b,p_action_id,auth.uid(),request,jsonb_build_object('ok',true,'results',results));
 perform realtime.send(jsonb_build_object('brandId',b),'neglected_changed','brand:'||b::text||':operations',true);
 -- Rotation joins the existing queue; the next normal scheduler handles dispatch.
 return jsonb_build_object('ok',true,'results',results);
end $$;

-- Keep existing function ownership, grants and checks; assert every patch target.
do $patch$
declare d text; signature text; guard text:=$g$where p.role = 'agent' and p.active and p.approval_status = 'approved'$g$;
begin
 -- Unassigned now has a real workflow meaning: NULL must never pass an owner check.
 foreach signature in array array['public.update_lead_notes(uuid,text,bigint)','public.update_lead_status(uuid,uuid,text,bigint,bigint)','public.manage_appointment(text,jsonb)'] loop
  d:=pg_get_functiondef(signature::regprocedure);
  d:=regexp_replace(d,'v_lead\.assigned_agent_id\s*<>\s*v_user','v_lead.assigned_agent_id is distinct from v_user','g');
  execute d;
 end loop;
 d:=pg_get_functiondef('leadlaju_private.dispatch_available_leads_current_cycle(timestamptz)'::regprocedure);
 if (length(d)-length(replace(d,guard,'')))/length(guard)<>2 then raise exception 'Unexpected dispatch candidates'; end if;
 execute replace(d,guard,guard||E'\n and not exists(select 1 from public.lead_neglect_events ne where ne.brand_id=v_lead.brand_id and ne.lead_id=v_lead.id and ne.agent_id=p.id)');
 d:=pg_get_functiondef('leadlaju_private.dispatch_available_leads_agent_brand(timestamptz)'::regprocedure);
 if strpos(d,'and p.brand_id = fresh.brand_id')=0 then raise exception 'Unexpected fresh retry guard'; end if;
 d:=replace(d,'and p.brand_id = fresh.brand_id',
  'and p.brand_id = fresh.brand_id and not exists(select 1 from public.lead_neglect_events ne where ne.brand_id=fresh.brand_id and ne.lead_id=fresh.id and ne.agent_id=p.id)');
 if (length(d)-length(replace(d,'and ape.project_id = retry.project_id','')))/length('and ape.project_id = retry.project_id')<>2 then raise exception 'Unexpected retry candidate guards'; end if;
 execute replace(d,'and ape.project_id = retry.project_id',
  'and ape.project_id = retry.project_id and not exists(select 1 from public.lead_neglect_events ne where ne.brand_id=retry.brand_id and ne.lead_id=retry.id and ne.agent_id=p.id)');
 d:=pg_get_functiondef('public.contact_assignment(uuid,uuid,bigint)'::regprocedure);
 if strpos(d,'v_lead.expires_at <= now()')=0 then raise exception 'Unexpected contact expiry guard'; end if;
 execute replace(d,'v_lead.expires_at <= now()','(not v_lead.admin_assigned and v_lead.expires_at <= now())');
 d:=pg_get_functiondef('leadlaju_private.sweep_agent_due_gate()'::regprocedure);
 if strpos(d,'total:=total+leadlaju_private.refresh_agent_due_gate(now());')=0 then raise exception 'Unexpected sweep'; end if;
 execute replace(d,'total:=total+leadlaju_private.refresh_agent_due_gate(now());',
  'total:=total+leadlaju_private.retract_neglected_brand(now()); total:=total+leadlaju_private.refresh_agent_due_gate(now());');
 d:=pg_get_functiondef('leadlaju_private.enqueue_sales_contact_reminders(timestamptz)'::regprocedure);
 if strpos(d,'and l.status in (''new'',''contacted'')')=0 then raise exception 'Unexpected age promotion'; end if;
 execute replace(d,'and l.status in (''new'',''contacted'')',
  'and not l.neglected_held and not (b.distribution_mode=''agent'' and l.status=''new'' and l.neglected_at is not null) and l.status in (''new'',''contacted'')');
 -- Include metadata in the existing dashboard projection without a second heavy query.
 d:=pg_get_functiondef('public.get_dashboard_state()'::regprocedure);
 if strpos(d,'''queue_state'',l.queue_state')=0 then raise exception 'Unexpected dashboard lead projection'; end if;
 execute replace(d,'''queue_state'',l.queue_state',
  '''neglected_at'',l.neglected_at,''neglected_held'',l.neglected_held,''admin_assigned'',l.admin_assigned,''queue_state'',l.queue_state');
end $patch$;

-- Explicit tenant executor ownership, and no direct user access to internal helpers.
grant create on schema public,leadlaju_private to leadlaju_tenant_executor;
alter function leadlaju_private.track_neglect_activity() owner to leadlaju_tenant_executor;
alter function leadlaju_private.retract_neglected_brand(timestamptz) owner to leadlaju_tenant_executor;
alter function leadlaju_private.assert_neglect_admin() owner to leadlaju_tenant_executor;
alter function public.get_neglected_leads_page(uuid,text,uuid,uuid,boolean,boolean) owner to leadlaju_tenant_executor;
alter function public.admin_resolve_neglected(uuid,jsonb,text,uuid) owner to leadlaju_tenant_executor;
revoke create on schema public,leadlaju_private from leadlaju_tenant_executor;
revoke all on function leadlaju_private.track_neglect_activity(),leadlaju_private.retract_neglected_brand(timestamptz),leadlaju_private.assert_neglect_admin() from public,anon,authenticated,service_role;
revoke all on function public.get_neglected_leads_page(uuid,text,uuid,uuid,boolean,boolean),public.admin_resolve_neglected(uuid,jsonb,text,uuid) from public,anon,service_role;
grant execute on function public.get_neglected_leads_page(uuid,text,uuid,uuid,boolean,boolean),public.admin_resolve_neglected(uuid,jsonb,text,uuid) to authenticated;
