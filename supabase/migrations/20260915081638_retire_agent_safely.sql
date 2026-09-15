create or replace function public.admin_retire_agent(p_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_lead public.leads%rowtype;
  v_cycle bigint;
  v_tombstone_email text := 'deleted+' || p_agent_id::text || '@invalid.leadlaju.local';
begin
  if not leadlaju_private.is_admin(v_user) or p_agent_id = v_user then
    raise exception 'Admin required';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_agent_id and role = 'agent'
  for update;
  if not found then raise exception 'Agent not found'; end if;

  select queue_cycle into v_cycle
  from public.dispatch_state
  where singleton
  for update;

  for v_lead in
    select * from public.leads
    where assigned_agent_id = p_agent_id
      and status = 'new'
      and queue_state = 'active'
    for update
  loop
    update public.lead_assignments
    set outcome = 'missed', resolved_at = now(), retry_cycle = v_cycle
    where lead_id = v_lead.id
      and assignment_revision = v_lead.assignment_revision
      and outcome = 'pending';

    update public.leads
    set assigned_agent_id = null,
      received_at = null,
      expires_at = null,
      queued_at = now(),
      queue_state = 'queued',
      pass_count = pass_count + 1,
      retry_after_cycle = v_cycle,
      assignment_revision = assignment_revision + 1,
      updated_at = now()
    where id = v_lead.id;

    insert into public.lead_events (lead_id, actor_id, event_type, assignment_revision)
    values (v_lead.id, v_user, 'agent_removed_requeue', v_lead.assignment_revision);
  end loop;

  update public.agent_availability
  set lead_ready = false,
    notification_ready = false,
    presence_lease_until = now(),
    forced_offline_at = now(),
    presence_revision = presence_revision + 1,
    updated_at = now()
  where agent_id = p_agent_id;

  update public.push_subscriptions
  set active = false, updated_at = now()
  where user_id = p_agent_id and active;

  update public.profiles
  set email = v_tombstone_email,
    approval_status = 'rejected',
    active = false,
    cooldown_until = null,
    updated_at = now()
  where id = p_agent_id;

  perform leadlaju_private.dispatch_available_leads(now());

  return jsonb_build_object(
    'ok', true,
    'user_id', p_agent_id,
    'original_email', v_profile.email,
    'tombstone_email', v_tombstone_email
  );
end;
$$;

revoke all on function public.admin_retire_agent(uuid) from public, anon;
grant execute on function public.admin_retire_agent(uuid) to authenticated;
