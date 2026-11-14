-- Team Sales only: a New lead nobody contacted within the brand's setting
-- (1-5 days, default 2) moves to another eligible Team Sales member.
-- Agent-mode brands, timed Ejen expiry and Neglected Lead are untouched.
alter table public.brands add column sales_reassign_days integer not null default 2
 check (sales_reassign_days between 1 and 5);

create index leads_sales_stale_sweep on public.leads(brand_id,received_at,id)
 where status='new' and queue_state='sales_assigned';

create function leadlaju_private.reassign_stale_team_sales_brand(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand(); days integer; l public.leads; recipient uuid; last_agent uuid;
 aid uuid; new_revision bigint; n integer:=0;
begin
 select b.sales_reassign_days into days from public.brands b where b.id=bid and b.active and b.distribution_mode='team_sales';
 if days is null then return 0; end if;
 -- Same lock order as dispatch_team_sales: brand dispatch state, project cursor, lead.
 perform 1 from public.dispatch_state where brand_id=bid and singleton for update;
 for l in select * from public.leads where brand_id=bid and status='new' and queue_state='sales_assigned'
  and assigned_agent_id is not null and received_at<=p_now-make_interval(hours=>days*24)
  order by received_at,id limit 200 for update skip locked loop
  insert into public.project_dispatch_state(brand_id,project_id) values(bid,l.project_id) on conflict(project_id) do nothing;
  select sales_last_agent_id into last_agent from public.project_dispatch_state where project_id=l.project_id and brand_id=bid for update;
  recipient:=null;
  -- Never the member who missed it now; prefer members who never held this lead,
  -- then the project's normal round-robin order.
  select p.id into recipient from public.profiles p
   join public.agent_project_eligibility e on e.agent_id=p.id and e.brand_id=p.brand_id
   where p.brand_id=bid and e.project_id=l.project_id and p.role='agent' and p.active and p.approval_status='approved'
    and p.id<>l.assigned_agent_id
   order by exists(select 1 from public.lead_assignments la where la.lead_id=l.id and la.agent_id=p.id and la.assignment_mode='team_sales'),
    case when last_agent is null or p.id>last_agent then 0 else 1 end,p.id
   limit 1;
  continue when recipient is null; -- Only one member: leave the lead with its owner.
  new_revision:=l.assignment_revision+1;
  update public.lead_assignments set outcome='missed',resolved_at=p_now
   where lead_id=l.id and assignment_revision=l.assignment_revision and assignment_mode='team_sales' and outcome='pending';
  update public.notification_outbox set sent_at=p_now,claimed_at=null,last_error='Cancelled: Team Sales lead reassigned'
   where brand_id=bid and lead_id=l.id and assignment_revision=l.assignment_revision and sent_at is null;
  update public.leads set assigned_agent_id=recipient,received_at=p_now,assignment_revision=new_revision,updated_at=p_now
   where id=l.id and brand_id=bid;
  insert into public.lead_assignments(brand_id,lead_id,agent_id,assignment_revision,assigned_at,expires_at,assignment_mode)
   values(bid,l.id,recipient,new_revision,p_now,null,'team_sales') returning id into aid;
  insert into public.lead_events(brand_id,lead_id,assignment_id,event_type,assignment_revision,payload)
   values(bid,l.id,aid,'assigned',new_revision,jsonb_build_object('reason','sales_stale_reassign',
    'previous_owner',l.assigned_agent_id,'previous_received_at',l.received_at,'days',days));
  insert into public.notification_outbox(brand_id,user_id,lead_id,assignment_revision,notification_type,payload)
   values(bid,recipient,l.id,new_revision,'sales_new_lead',jsonb_build_object('lead_id',l.id,'assignment_revision',new_revision))
   on conflict do nothing;
  update public.project_dispatch_state set sales_last_agent_id=recipient,updated_at=p_now where project_id=l.project_id and brand_id=bid;
  perform realtime.send(jsonb_build_object('leadId',l.id,'brandId',bid,'revision',new_revision),
   'assignment_revoked','user:'||l.assigned_agent_id::text,true);
  n:=n+1;
 end loop;
 return n;
end $$;

create function leadlaju_private.reassign_stale_team_sales() returns integer
language plpgsql security definer set search_path='' as $$
declare bid uuid; previous_brand text:=current_setting('leadlaju.worker_brand',true); total integer:=0;
begin
 if auth.uid() is not null then raise exception 'Trusted scheduler required' using errcode='42501'; end if;
 for bid in select b.id from public.brands b where b.active and b.distribution_mode='team_sales'
  and exists(select 1 from public.leads l where l.brand_id=b.id and l.status='new' and l.queue_state='sales_assigned'
   and l.received_at<=clock_timestamp()-make_interval(hours=>b.sales_reassign_days*24))
  order by b.id loop
  perform set_config('leadlaju.worker_brand',bid::text,true);
  total:=total+leadlaju_private.reassign_stale_team_sales_brand(clock_timestamp());
 end loop;
 perform set_config('leadlaju.worker_brand',coalesce(previous_brand,''),true);
 return total;
end $$;

-- Agent brands already have admin_due_limit_update; this covers Team Sales brands only.
create policy admin_sales_reassign_update on public.brands for update to leadlaju_tenant_executor
using(id=(select leadlaju_private.request_brand()) and distribution_mode='team_sales' and leadlaju_private.is_admin(auth.uid()))
with check(id=(select leadlaju_private.request_brand()) and distribution_mode='team_sales' and leadlaju_private.is_admin(auth.uid()));
create policy sales_reassign_days_audit on public.master_audit_log for insert to leadlaju_tenant_executor
 with check(actor_id=auth.uid() and brand_id=(select leadlaju_private.request_brand()) and action='sales_reassign_days');
create function public.admin_set_sales_reassign_days(p_days integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand(); previous_days integer;
begin
 if auth.uid() is null or not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required' using errcode='42501';end if;
 if p_days is null or p_days<1 or p_days>5 then raise exception 'Tempoh mesti 1 hingga 5 hari' using errcode='22023';end if;
 select sales_reassign_days into previous_days from public.brands where id=bid and active and distribution_mode='team_sales' for update;
 if not found then raise exception 'Active Team Sales brand required' using errcode='42501';end if;
 if previous_days<>p_days then
   update public.brands set sales_reassign_days=p_days,updated_at=clock_timestamp() where id=bid;
   insert into public.master_audit_log(actor_id,brand_id,action,target_id,details)
    values(auth.uid(),bid,'sales_reassign_days',bid,jsonb_build_object('previous_days',previous_days,'days',p_days));
   perform realtime.send(jsonb_build_object('brandId',bid,'salesReassignDays',p_days),
    'sales_reassign_settings_changed','brand:'||bid::text||':operations',true);
 end if;
 -- The scheduler applies the new setting on its next run; saving moves no lead.
 return jsonb_build_object('ok',true,'sales_reassign_days',p_days);
end $$;

-- Production runtime roles intentionally lack schema CREATE. Ownership transfer
-- needs it, so grant/revoke inside this atomic transaction only.
do $ownership$
declare had_public boolean:=has_schema_privilege('leadlaju_tenant_executor','public','CREATE');
 had_private boolean:=has_schema_privilege('leadlaju_tenant_executor','leadlaju_private','CREATE');
begin
 if not had_public then grant create on schema public to leadlaju_tenant_executor;end if;
 if not had_private then grant create on schema leadlaju_private to leadlaju_tenant_executor;end if;
 alter function leadlaju_private.reassign_stale_team_sales_brand(timestamptz) owner to leadlaju_tenant_executor;
 alter function public.admin_set_sales_reassign_days(integer) owner to leadlaju_tenant_executor;
 if not had_public then revoke create on schema public from leadlaju_tenant_executor;end if;
 if not had_private then revoke create on schema leadlaju_private from leadlaju_tenant_executor;end if;
end $ownership$;
revoke all on function leadlaju_private.reassign_stale_team_sales_brand(timestamptz) from public,anon,authenticated,service_role;
grant execute on function leadlaju_private.reassign_stale_team_sales_brand(timestamptz) to leadlaju_tenant_executor;
revoke all on function leadlaju_private.reassign_stale_team_sales() from public,anon,authenticated,service_role;
revoke all on function public.admin_set_sales_reassign_days(integer) from public,anon,service_role;
grant execute on function public.admin_set_sales_reassign_days(integer) to authenticated;

select cron.schedule('leadlaju-team-sales-stale-reassign','*/5 * * * *',
 'select leadlaju_private.reassign_stale_team_sales()');
