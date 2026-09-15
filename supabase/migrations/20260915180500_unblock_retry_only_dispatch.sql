alter function leadlaju_private.dispatch_available_leads(timestamptz)
  rename to dispatch_available_leads_current_cycle;

create or replace function leadlaju_private.dispatch_available_leads(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.dispatch_state%rowtype;
  v_next_retry_cycle bigint;
begin
  select * into v_state
  from public.dispatch_state
  where singleton
  for update;

  -- A retry-only queue cannot advance through the fresh-lead branch. Start the
  -- next retry round only after every currently eligible retry has been tried.
  if not exists (
      select 1
      from public.leads fresh
      where fresh.status = 'new'
        and fresh.queue_state = 'queued'
        and fresh.pass_count = 0
    )
    and exists (
      select 1
      from public.leads retry
      join public.profiles p on p.role = 'agent'
        and p.active
        and p.approval_status = 'approved'
      join public.agent_availability av on av.agent_id = p.id
      join public.agent_project_eligibility ape
        on ape.agent_id = p.id
       and ape.project_id = retry.project_id
      where retry.status = 'new'
        and retry.queue_state = 'queued'
        and retry.pass_count > 0
        and av.lead_ready
        and av.notification_ready
        and av.presence_lease_until > p_now
        and (p.cooldown_until is null or p.cooldown_until <= p_now)
        and not exists (
          select 1
          from public.leads occupied
          where occupied.assigned_agent_id = p.id
            and occupied.status = 'new'
            and occupied.queue_state = 'active'
        )
    )
    and not exists (
      select 1
      from public.leads retry
      join public.profiles p on p.role = 'agent'
        and p.active
        and p.approval_status = 'approved'
      join public.agent_availability av on av.agent_id = p.id
      join public.agent_project_eligibility ape
        on ape.agent_id = p.id
       and ape.project_id = retry.project_id
      where retry.status = 'new'
        and retry.queue_state = 'queued'
        and retry.pass_count > 0
        and retry.retry_after_cycle <= v_state.queue_cycle
        and av.lead_ready
        and av.notification_ready
        and av.presence_lease_until > p_now
        and (p.cooldown_until is null or p.cooldown_until <= p_now)
        and not exists (
          select 1
          from public.leads occupied
          where occupied.assigned_agent_id = p.id
            and occupied.status = 'new'
            and occupied.queue_state = 'active'
        )
        and not exists (
          select 1
          from public.lead_assignments previous
          where previous.lead_id = retry.id
            and previous.agent_id = p.id
            and previous.outcome = 'missed'
            and previous.retry_cycle = v_state.queue_cycle
        )
    )
  then
    select min(retry.retry_after_cycle)
    into v_next_retry_cycle
    from public.leads retry
    where retry.status = 'new'
      and retry.queue_state = 'queued'
      and retry.pass_count > 0;

    v_state.queue_cycle := greatest(
      v_state.queue_cycle + 1,
      coalesce(v_next_retry_cycle, v_state.queue_cycle + 1)
    );

    update public.dispatch_state
    set queue_cycle = v_state.queue_cycle,
        updated_at = p_now
    where singleton;
  end if;

  return leadlaju_private.dispatch_available_leads_current_cycle(p_now);
end;
$$;

revoke all on function leadlaju_private.dispatch_available_leads(timestamptz)
  from public, anon, authenticated;
revoke all on function leadlaju_private.dispatch_available_leads_current_cycle(timestamptz)
  from public, anon, authenticated;
