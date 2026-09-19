create or replace function leadlaju_private.has_phone_push_subscription(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.push_subscriptions ps
    where ps.user_id = p_user_id
      and ps.active
      and (
        lower(coalesce(ps.user_agent, '')) like '%iphone%'
        or (
          lower(coalesce(ps.user_agent, '')) like '%android%'
          and lower(coalesce(ps.user_agent, '')) like '%mobile%'
        )
      )
  );
$$;

revoke all on function leadlaju_private.has_phone_push_subscription(uuid) from public, anon, authenticated;

create or replace function public.set_agent_availability(
  p_ready boolean,
  p_notification_ready boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_phone_notification_ready boolean;
begin
  if v_user is null or not exists (
    select 1 from public.profiles
    where id = v_user and role = 'agent' and active and approval_status = 'approved'
  ) then
    raise exception 'Agent is not eligible';
  end if;

  select leadlaju_private.has_phone_push_subscription(v_user)
  into v_phone_notification_ready;
  if p_ready and not v_phone_notification_ready then
    raise exception 'An active phone push subscription is required';
  end if;

  insert into public.agent_availability (
    agent_id, lead_ready, notification_ready, last_seen_at,
    presence_lease_until, presence_revision
  ) values (
    v_user, p_ready, v_phone_notification_ready, now(),
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
    'ok', true,
    'lead_ready', p_ready,
    'notification_ready', v_phone_notification_ready
  );
end;
$$;

create or replace function public.heartbeat_agent(
  p_session_started_at timestamptz,
  p_notification_ready boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_availability public.agent_availability%rowtype;
  v_phone_notification_ready boolean;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into v_availability
  from public.agent_availability
  where agent_id = v_user
  for update;

  if v_availability.forced_offline_at is not null
    and p_session_started_at < v_availability.forced_offline_at then
    return jsonb_build_object('ok', false, 'revoked', true, 'error', 'Session was forced offline');
  end if;

  select leadlaju_private.has_phone_push_subscription(v_user)
  into v_phone_notification_ready;
  insert into public.agent_availability (
    agent_id, notification_ready, last_seen_at,
    presence_lease_until, presence_revision
  ) values (
    v_user, v_phone_notification_ready, now(), now() + interval '60 minutes', 1
  )
  on conflict (agent_id) do update set
    notification_ready = excluded.notification_ready,
    lead_ready = public.agent_availability.lead_ready and excluded.notification_ready,
    last_seen_at = excluded.last_seen_at,
    presence_lease_until = excluded.presence_lease_until,
    presence_revision = public.agent_availability.presence_revision + 1,
    updated_at = now();
  return jsonb_build_object(
    'ok', true, 'online', true, 'notification_ready', v_phone_notification_ready
  );
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
  v_phone_notification_ready boolean;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.push_subscriptions
  set active = false, updated_at = now()
  where endpoint = trim(p_endpoint) and user_id = v_user and active;
  get diagnostics v_count = row_count;

  select leadlaju_private.has_phone_push_subscription(v_user)
  into v_phone_notification_ready;
  update public.agent_availability
  set notification_ready = v_phone_notification_ready,
      lead_ready = lead_ready and v_phone_notification_ready,
      updated_at = now()
  where agent_id = v_user;
  return jsonb_build_object(
    'ok', true, 'updated', v_count,
    'notification_ready', v_phone_notification_ready
  );
end;
$$;

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_previous_user uuid;
  v_previous_phone_ready boolean;
  v_phone_notification_ready boolean;
  v_id uuid;
begin
  if v_user is null or coalesce(trim(p_endpoint), '') = ''
    or coalesce(trim(p_p256dh), '') = '' or coalesce(trim(p_auth), '') = '' then
    raise exception 'Invalid push subscription';
  end if;

  select user_id into v_previous_user
  from public.push_subscriptions
  where endpoint = trim(p_endpoint)
  for update;

  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent, active)
  values(v_user, trim(p_endpoint), trim(p_p256dh), trim(p_auth), coalesce(p_user_agent, ''), true)
  on conflict(endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    active = true,
    failure_count = 0,
    updated_at = now()
  returning id into v_id;

  select leadlaju_private.has_phone_push_subscription(v_user)
  into v_phone_notification_ready;
  update public.agent_availability
  set notification_ready = v_phone_notification_ready,
      lead_ready = lead_ready and v_phone_notification_ready,
      updated_at = now()
  where agent_id = v_user;

  if v_previous_user is not null and v_previous_user <> v_user then
    select leadlaju_private.has_phone_push_subscription(v_previous_user)
    into v_previous_phone_ready;
    update public.agent_availability
    set notification_ready = v_previous_phone_ready,
        lead_ready = lead_ready and v_previous_phone_ready,
        updated_at = now()
    where agent_id = v_previous_user;
  end if;

  return jsonb_build_object(
    'ok', true,
    'subscription_id', v_id,
    'notification_ready', v_phone_notification_ready
  );
end;
$$;

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
  v_phone_notification_ready boolean := false;
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

  select leadlaju_private.has_phone_push_subscription(p_agent_id)
  into v_phone_notification_ready;
  if p_ready then
    select coalesce(presence_lease_until > now(), false)
    into v_online
    from public.agent_availability
    where agent_id = p_agent_id;

    if not v_online then
      raise exception 'Agent is not online';
    end if;
    if not v_phone_notification_ready then
      raise exception 'Agent phone notifications are not ready';
    end if;
  end if;

  insert into public.agent_availability (
    agent_id, lead_ready, notification_ready, presence_lease_until, presence_revision
  ) values (
    p_agent_id, p_ready, v_phone_notification_ready, now(), 1
  )
  on conflict (agent_id) do update set
    lead_ready = excluded.lead_ready,
    notification_ready = excluded.notification_ready,
    presence_revision = public.agent_availability.presence_revision + 1,
    updated_at = now();

  if p_ready then
    perform leadlaju_private.dispatch_available_leads(now());
  end if;
  return jsonb_build_object('ok', true, 'agent_id', p_agent_id, 'lead_ready', p_ready);
end;
$$;

create or replace function public.admin_set_all_agent_lead_readiness(
  p_ready boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if not leadlaju_private.is_admin(auth.uid()) then
    raise exception 'Admin required';
  end if;

  if p_ready then
    update public.agent_availability av
    set lead_ready = true,
        notification_ready = true,
        presence_lease_until = greatest(
          coalesce(av.presence_lease_until, '-infinity'::timestamptz),
          now() + interval '60 minutes'
        ),
        presence_revision = av.presence_revision + 1,
        updated_at = now()
    from public.profiles p
    where p.id = av.agent_id
      and p.role = 'agent'
      and p.active
      and p.approval_status = 'approved'
      and (av.forced_offline_at is null or av.last_seen_at > av.forced_offline_at)
      and leadlaju_private.has_phone_push_subscription(av.agent_id);
    get diagnostics v_updated = row_count;

    if v_updated > 0 then
      perform leadlaju_private.dispatch_available_leads(now());
    end if;
  else
    update public.agent_availability av
    set lead_ready = false,
        presence_revision = av.presence_revision + 1,
        updated_at = now()
    from public.profiles p
    where p.id = av.agent_id
      and p.role = 'agent'
      and p.active
      and p.approval_status = 'approved'
      and av.lead_ready;
    get diagnostics v_updated = row_count;
  end if;

  return jsonb_build_object('ok', true, 'lead_ready', p_ready, 'updated', v_updated);
end;
$$;

with phone_readiness as (
  select av.agent_id, leadlaju_private.has_phone_push_subscription(av.agent_id) as phone_ready
  from public.agent_availability av
)
update public.agent_availability av
set notification_ready = readiness.phone_ready,
    lead_ready = av.lead_ready and readiness.phone_ready,
    presence_revision = av.presence_revision + 1,
    updated_at = now()
from phone_readiness readiness
where readiness.agent_id = av.agent_id
  and (
    av.notification_ready is distinct from readiness.phone_ready
    or (av.lead_ready and not readiness.phone_ready)
  );

revoke all on function public.set_agent_availability(boolean, boolean) from public, anon;
revoke all on function public.heartbeat_agent(timestamptz, boolean) from public, anon;
revoke all on function public.unregister_push_subscription(text) from public, anon;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.admin_set_agent_lead_readiness(uuid, boolean) from public, anon;
revoke all on function public.admin_set_all_agent_lead_readiness(boolean) from public, anon;
grant execute on function public.set_agent_availability(boolean, boolean) to authenticated;
grant execute on function public.heartbeat_agent(timestamptz, boolean) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.admin_set_agent_lead_readiness(uuid, boolean) to authenticated;
grant execute on function public.admin_set_all_agent_lead_readiness(boolean) to authenticated;
