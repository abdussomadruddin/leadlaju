-- Run atomically after the read-only metadata backup. No production execution
-- is performed merely by adding this migration to the checkout.
alter table public.brands add column neglect_days integer not null default 5
 check (neglect_days between 3 and 14);
alter table public.leads add column neglect_due_at timestamptz;

-- Preserve all existing five-day clocks exactly, including already-due leads.
-- The transaction's table DDL lock prevents concurrent lead writes here. Suppress
-- only backfill broadcasts, never ownership/activity guards or business events.
alter table public.leads disable trigger leads_realtime_broadcast;
update public.leads l set neglect_due_at=l.neglect_activity_at+interval '120 hours'
 from public.brands b where b.id=l.brand_id and b.distribution_mode='agent'
 and l.status='contacted' and l.assigned_agent_id is not null and not l.neglected_held
 and l.neglect_activity_at is not null;
alter table public.leads enable trigger leads_realtime_broadcast;

create function leadlaju_private.track_neglect_deadline() returns trigger
language plpgsql security definer set search_path='' as $$
declare days integer;
begin
 select b.neglect_days into days from public.brands b where b.id=new.brand_id and b.distribution_mode='agent';
 if days is null or new.neglected_held or new.status<>'contacted' or new.assigned_agent_id is null then
   new.neglect_due_at:=null;
 elsif tg_op='INSERT' then
   new.neglect_activity_at:=coalesce(new.neglect_activity_at,new.follow_up_activity_at,new.contacted_at,new.status_updated_at,clock_timestamp());
   new.neglect_due_at:=new.neglect_activity_at+make_interval(hours=>days*24);
 elsif old.status is distinct from new.status or old.notes is distinct from new.notes
   or (new.follow_up_count>old.follow_up_count and new.follow_up_count<=6) then
   -- The existing activity trigger already established this business timestamp.
   new.neglect_due_at:=new.neglect_activity_at+make_interval(hours=>days*24);
 else
   -- The deadline and clock are server-owned. Technical writes, identical notes
   -- and direct attempts to edit the deadline cannot renew an assignment.
   new.neglect_activity_at:=old.neglect_activity_at;
   new.neglect_due_at:=old.neglect_due_at;
 end if;
 return new;
end $$;
-- Production runtime roles intentionally lack schema CREATE. Ownership transfer
-- needs it, so grant/revoke inside this atomic transaction only; preserve the
-- exact pre-existing effective privilege rather than leaving CREATE enabled.
do $ownership$
declare had_create boolean:=has_schema_privilege('leadlaju_tenant_executor','leadlaju_private','CREATE');
begin
 if not had_create then grant create on schema leadlaju_private to leadlaju_tenant_executor;end if;
 alter function leadlaju_private.track_neglect_deadline() owner to leadlaju_tenant_executor;
 if not had_create then revoke create on schema leadlaju_private from leadlaju_tenant_executor;end if;
end $ownership$;
revoke all on function leadlaju_private.track_neglect_deadline() from public,anon,authenticated,service_role;
-- Alphabetic BEFORE-trigger ordering: run after activity tracking AND brand
-- stamping, including inserts whose brand is supplied by the trusted context.
-- Preserve the exact dispatcher exceptions and old-owner safeguards.
create trigger zz_leads_neglect_deadline before insert or update on public.leads
 for each row execute function leadlaju_private.track_neglect_deadline();

create index leads_neglect_deadline_sweep on public.leads(brand_id,neglect_due_at,id)
 where status='contacted' and assigned_agent_id is not null and not neglected_held;
do $migration$
declare d text;
begin
 d:=pg_get_functiondef('leadlaju_private.retract_neglected_brand(timestamptz)'::regprocedure);
 if position($predicate$neglect_activity_at<=p_now-interval '120 hours'$predicate$ in d)=0 then raise exception 'Unexpected retraction predicate';end if;
 d:=replace(d,$predicate$neglect_activity_at<=p_now-interval '120 hours'$predicate$,'neglect_due_at<=p_now');
 d:=replace(d,'order by neglect_activity_at,id limit 200','order by neglect_due_at,id limit 200');
 execute d;
end $migration$;
drop index public.leads_neglect_sweep;

create policy neglect_days_audit on public.master_audit_log for insert to leadlaju_tenant_executor
 with check(actor_id=auth.uid() and brand_id=(select leadlaju_private.request_brand()) and action='neglect_days');
create function public.admin_set_neglect_days(p_days integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand(); previous_days integer;
begin
 if auth.uid() is null or not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required' using errcode='42501';end if;
 if p_days is null or p_days<3 or p_days>14 then raise exception 'Tempoh mesti 3 hingga 14 hari' using errcode='22023';end if;
 select neglect_days into previous_days from public.brands where id=bid and active and distribution_mode='agent' for update;
 if not found then raise exception 'Active Agent brand required' using errcode='42501';end if;
 if previous_days<>p_days then
   update public.brands set neglect_days=p_days,updated_at=clock_timestamp() where id=bid;
   insert into public.master_audit_log(actor_id,brand_id,action,target_id,details)
    values(auth.uid(),bid,'neglect_days',bid,jsonb_build_object('previous_days',previous_days,'days',p_days));
   perform realtime.send(jsonb_build_object('brandId',bid,'neglectDays',p_days),
    'neglect_settings_changed','brand:'||bid::text||':operations',true);
 end if;
 -- Never update/retract leads or call the dispatch/due-gate scheduler on save.
 return jsonb_build_object('ok',true,'neglect_days',p_days);
end $$;
-- Production runtime roles intentionally lack schema CREATE. Ownership transfer
-- needs it, so grant/revoke inside this atomic transaction only; preserve the
-- exact pre-existing effective privilege rather than leaving CREATE enabled.
do $ownership$
declare had_create boolean:=has_schema_privilege('leadlaju_tenant_executor','public','CREATE');
begin
 if not had_create then grant create on schema public to leadlaju_tenant_executor;end if;
 alter function public.admin_set_neglect_days(integer) owner to leadlaju_tenant_executor;
 if not had_create then revoke create on schema public from leadlaju_tenant_executor;end if;
end $ownership$;
revoke all on function public.admin_set_neglect_days(integer) from public,anon,service_role;
grant execute on function public.admin_set_neglect_days(integer) to authenticated;
