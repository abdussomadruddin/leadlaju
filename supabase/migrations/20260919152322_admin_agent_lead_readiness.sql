create or replace function public.admin_set_agent_lead_readiness(
  p_agent_id uuid,
  p_ready boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.profiles%rowtype;
  v_notification_ready boolean := false;
  v_online boolean := false;
begin
  if not leadlaju_private.is_admin(auth.uid()) then
    raise exception 'Admin required';
  end if;

  select * into v_agent
  from public.profiles
  where id = p_agent_id
  for update;

  if not found or v_agent.role <> 'agent' or not v_agent.active or v_agent.approval_status <> 'approved' then
    raise exception 'Agent is not eligible';
  end if;

  if p_ready then
    select exists (
      select 1
      from public.push_subscriptions
      where user_id = p_agent_id and active
    ) into v_notification_ready;

    select coalesce(presence_lease_until > now(), false)
    into v_online
    from public.agent_availability
    where agent_id = p_agent_id;

    if not v_online then
      raise exception 'Agent is not online';
    end if;

    if not v_notification_ready then
      raise exception 'Agent notifications are not ready';
    end if;
  end if;

  insert into public.agent_availability (
    agent_id,
    lead_ready,
    notification_ready,
    presence_lease_until,
    presence_revision
  ) values (
    p_agent_id,
    p_ready,
    p_ready and v_notification_ready,
    now(),
    1
  )
  on conflict (agent_id) do update set
    lead_ready = excluded.lead_ready,
    notification_ready = case
      when p_ready then true
      else public.agent_availability.notification_ready
    end,
    presence_revision = public.agent_availability.presence_revision + 1,
    updated_at = now();

  if p_ready then
    perform leadlaju_private.dispatch_available_leads(now());
  end if;

  return jsonb_build_object(
    'ok', true,
    'agent_id', p_agent_id,
    'lead_ready', p_ready
  );
end;
$$;

revoke all on function public.admin_set_agent_lead_readiness(uuid, boolean) from public, anon;
grant execute on function public.admin_set_agent_lead_readiness(uuid, boolean) to authenticated;
