-- Keep the existing tenant-owned dispatcher and all retry/assignment rules.
-- Fresh leads only hold back retry advancement when they can be assigned now.
do $migration$
declare
  definition text;
  old_guard text := $old$from public.leads fresh
      where fresh.status = 'new'
        and fresh.queue_state = 'queued'
        and fresh.pass_count = 0$old$;
  new_guard text := $new$from public.leads fresh
      join public.profiles p on p.role = 'agent'
        and p.active and p.get_lead_allowed and not p.follow_up_due_blocked
        and p.approval_status = 'approved'
        and p.brand_id = fresh.brand_id
      join public.agent_availability av on av.agent_id = p.id
        and av.brand_id = fresh.brand_id
      join public.agent_project_eligibility ape on ape.agent_id = p.id
        and ape.project_id = fresh.project_id and ape.brand_id = fresh.brand_id
      where fresh.status = 'new'
        and fresh.queue_state = 'queued'
        and fresh.pass_count = 0
        and av.lead_ready and av.notification_ready
        and av.presence_lease_until > p_now
        and (p.cooldown_until is null or p.cooldown_until <= p_now)
        and not exists (
          select 1 from public.leads occupied
          where occupied.assigned_agent_id = p.id
            and occupied.status = 'new' and occupied.queue_state = 'active'
        )$new$;
begin
  definition := pg_get_functiondef('leadlaju_private.dispatch_available_leads_agent_brand(timestamptz)'::regprocedure);
  if strpos(definition, old_guard) = 0 then
    if strpos(definition, new_guard) > 0 then return; end if;
    raise exception 'Unexpected dispatcher definition: fresh guard not found';
  end if;
  execute replace(definition, old_guard, new_guard);
end;
$migration$;
