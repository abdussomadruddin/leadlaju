-- Keep signatures, ownership, grants, RLS, queue order and scheduler cadence.
-- Aggregate history once, rather than executing a correlated RLS read per lead.
do $migration$
declare d text; old_history text := $old$'assignment_history', coalesce((select jsonb_agg(jsonb_build_object(
        'agentId', la.agent_id, 'assignmentRevision', la.assignment_revision,
        'assignedAt', la.assigned_at, 'expiresAt', la.expires_at,
        'resolvedAt', la.resolved_at, 'outcome', la.outcome, 'retryCycle', la.retry_cycle
      ) order by la.assignment_revision) from public.lead_assignments la where la.lead_id=l.id),'[]'::jsonb)$old$;
begin
 d:=pg_get_functiondef('public.get_dashboard_state()'::regprocedure);
 if position(old_history in d)=0 then raise exception 'Unexpected dashboard history definition'; end if;
 d:=replace(d,old_history,$new$'assignment_history', coalesce(ah.history,'[]'::jsonb)$new$);
 if position('  select jsonb_build_object(' in d)=0 or position('from public.leads l join public.projects pr on pr.id=l.project_id' in d)=0 then
   raise exception 'Unexpected dashboard projection';
 end if;
 d:=replace(d,'  select jsonb_build_object(',$cte$  with assignment_histories as materialized (
    select la.lead_id, jsonb_agg(jsonb_build_object(
      'agentId',la.agent_id,'assignmentRevision',la.assignment_revision,
      'assignedAt',la.assigned_at,'expiresAt',la.expires_at,
      'resolvedAt',la.resolved_at,'outcome',la.outcome,'retryCycle',la.retry_cycle
    ) order by la.assignment_revision) as history
    from public.lead_assignments la
    join public.leads visible on visible.id=la.lead_id
    where v_is_admin or visible.assigned_agent_id=v_user
    group by la.lead_id
  )
  select jsonb_build_object($cte$);
 d:=replace(d,'from public.leads l join public.projects pr on pr.id=l.project_id',
   'from public.leads l join public.projects pr on pr.id=l.project_id left join assignment_histories ah on ah.lead_id=l.id');
 execute d;
end $migration$;

-- A dispatch with no assignments changes neither cursor nor queue cycle.
-- Avoid generating a new tuple/WAL entry solely for updated_at every 5 seconds.
do $migration$
declare d text; original text := $old$  update public.dispatch_state set queue_cycle = v_state.queue_cycle,
    pick_latest_next = v_state.pick_latest_next, updated_at = p_now where singleton;$old$;
begin
 d:=pg_get_functiondef('leadlaju_private.dispatch_available_leads_current_cycle(timestamptz)'::regprocedure);
 if position(original in d)=0 then raise exception 'Unexpected dispatch cursor definition'; end if;
 execute replace(d,original,'  if v_assigned > 0 then '||original||' end if;');

 d:=pg_get_functiondef('leadlaju_private.dispatch_available_leads_agent_brand(timestamptz)'::regprocedure);
 original:='  perform leadlaju_private.refresh_agent_due_gate(p_now);';
 if position(original in d)=0 then raise exception 'Unexpected agent dispatch gate'; end if;
 -- Refresh the due gate first. The conservative EXISTS omits retry-cycle and
 -- previous-neglect exclusions: it may admit extra work, never skip a candidate.
 execute replace(d,original,original||$guard$
  if not exists (
    select 1 from public.profiles p
    join public.agent_availability av on av.agent_id=p.id and av.brand_id=p.brand_id
    join public.agent_project_eligibility ape on ape.agent_id=p.id and ape.brand_id=p.brand_id
    join public.leads queued on queued.project_id=ape.project_id and queued.brand_id=p.brand_id
    where p.role='agent' and p.active and p.approval_status='approved'
      and p.get_lead_allowed and not p.follow_up_due_blocked
      and av.lead_ready and av.notification_ready and av.presence_lease_until>p_now
      and (p.cooldown_until is null or p.cooldown_until<=p_now)
      and queued.status='new' and queued.queue_state='queued'
      and not exists(select 1 from public.leads occupied where occupied.assigned_agent_id=p.id
        and occupied.status='new' and occupied.queue_state='active')
  ) then return 0; end if;
$guard$);
end $migration$;

-- Only global scheduler entrypoints use try-locks. Scoped user actions keep their
-- existing synchronous locks/checks; duplicate scheduler calls retry next tick.
do $migration$
declare d text; marker text;
begin
 d:=pg_get_functiondef('leadlaju_private.expire_assignments(timestamptz)'::regprocedure);
 marker:='       for b in select id from public.brands where active order by id loop';
 if position(marker in d)=0 then raise exception 'Unexpected global expiry wrapper'; end if;
 execute replace(d,marker,$guard$       if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('leadlaju-scheduler-expiry',0)) then return 0; end if;
$guard$||marker);
 d:=pg_get_functiondef('leadlaju_private.sweep_agent_due_gate()'::regprocedure);
 marker:=' for b in select id from public.brands where active and distribution_mode=''agent'' order by id loop';
 if position(marker in d)=0 then raise exception 'Unexpected due-gate scheduler wrapper'; end if;
 execute replace(d,marker,$guard$ if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('leadlaju-scheduler-due-gate',0)) then return 0; end if;
$guard$||marker);
end $migration$;
