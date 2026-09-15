create or replace function public.set_agent_availability(
  p_ready boolean, p_notification_ready boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_notification_ready boolean;
begin
  if v_user is null or not exists (
    select 1 from public.profiles where id = v_user and role = 'agent'
      and active and approval_status = 'approved'
  ) then
    raise exception 'Agent is not eligible';
  end if;

  select exists (
    select 1 from public.push_subscriptions where user_id = v_user and active
  ) into v_notification_ready;
  if p_ready and not v_notification_ready then
    raise exception 'An active push subscription is required';
  end if;

  insert into public.agent_availability (
    agent_id, lead_ready, notification_ready, last_seen_at,
    presence_lease_until, presence_revision
  ) values (
    v_user, p_ready, v_notification_ready, now(),
    case when p_ready then now() + interval '60 minutes' else now() end, 1
  )
  on conflict (agent_id) do update set
    lead_ready = excluded.lead_ready,
    notification_ready = excluded.notification_ready,
    last_seen_at = excluded.last_seen_at,
    presence_lease_until = excluded.presence_lease_until,
    presence_revision = public.agent_availability.presence_revision + 1,
    updated_at = now();
  if p_ready then
    perform leadlaju_private.dispatch_available_leads(now());
  end if;
  return jsonb_build_object(
    'ok', true, 'lead_ready', p_ready,
    'notification_ready', v_notification_ready
  );
end;
$$;

create or replace function public.heartbeat_agent(
  p_session_started_at timestamptz, p_notification_ready boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_availability public.agent_availability%rowtype;
  v_notification_ready boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_availability from public.agent_availability
  where agent_id = v_user for update;
  if v_availability.forced_offline_at is not null
    and p_session_started_at < v_availability.forced_offline_at then
    return jsonb_build_object('ok', false, 'revoked', true, 'error', 'Session was forced offline');
  end if;
  select exists (
    select 1 from public.push_subscriptions where user_id = v_user and active
  ) into v_notification_ready;
  insert into public.agent_availability (
    agent_id, notification_ready, last_seen_at,
    presence_lease_until, presence_revision
  ) values (
    v_user, v_notification_ready, now(), now() + interval '60 minutes', 1
  )
  on conflict (agent_id) do update set
    notification_ready = excluded.notification_ready,
    last_seen_at = excluded.last_seen_at,
    presence_lease_until = excluded.presence_lease_until,
    presence_revision = public.agent_availability.presence_revision + 1,
    updated_at = now();
  return jsonb_build_object(
    'ok', true, 'online', true, 'notification_ready', v_notification_ready
  );
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
  v_notification_ready boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.push_subscriptions set active = false, updated_at = now()
  where endpoint = trim(p_endpoint) and user_id = v_user and active;
  get diagnostics v_count = row_count;
  select exists (
    select 1 from public.push_subscriptions where user_id = v_user and active
  ) into v_notification_ready;
  update public.agent_availability
  set notification_ready = v_notification_ready,
      lead_ready = lead_ready and v_notification_ready,
      updated_at = now()
  where agent_id = v_user;
  return jsonb_build_object(
    'ok', true, 'updated', v_count,
    'notification_ready', v_notification_ready
  );
end;
$$;

create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_previous_user uuid;
  v_previous_ready boolean;
  v_id uuid;
begin
  if v_user is null or coalesce(trim(p_endpoint), '') = ''
    or coalesce(trim(p_p256dh), '') = '' or coalesce(trim(p_auth), '') = '' then
    raise exception 'Invalid push subscription';
  end if;
  select user_id into v_previous_user from public.push_subscriptions
  where endpoint = trim(p_endpoint) for update;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent, active)
  values(v_user, trim(p_endpoint), trim(p_p256dh), trim(p_auth), coalesce(p_user_agent, ''), true)
  on conflict(endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, active = true, failure_count = 0, updated_at = now()
  returning id into v_id;
  update public.agent_availability set notification_ready = true, updated_at = now()
  where agent_id = v_user;

  if v_previous_user is not null and v_previous_user <> v_user then
    select exists (
      select 1 from public.push_subscriptions where user_id = v_previous_user and active
    ) into v_previous_ready;
    update public.agent_availability
    set notification_ready = v_previous_ready,
        lead_ready = lead_ready and v_previous_ready,
        updated_at = now()
    where agent_id = v_previous_user;
  end if;
  return jsonb_build_object('ok', true, 'subscription_id', v_id);
end;
$$;
