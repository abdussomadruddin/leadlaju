create or replace function public.update_lead_notes(
  p_lead_id uuid, p_notes text, p_expected_status_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_lead public.leads%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead not found'; end if;
  if not leadlaju_private.is_admin(v_user) and v_lead.assigned_agent_id <> v_user then
    raise exception 'Lead belongs to another agent';
  end if;
  if v_lead.status_revision <> p_expected_status_revision then
    return jsonb_build_object('ok', false, 'stale', true, 'error', 'Lead status has changed');
  end if;
  update public.leads set notes = coalesce(p_notes, ''), updated_at = now() where id = p_lead_id;
  insert into public.lead_events (lead_id, actor_id, event_type, assignment_revision, status_revision)
  values (p_lead_id, v_user, 'notes_updated', v_lead.assignment_revision, v_lead.status_revision);
  return jsonb_build_object('ok', true, 'lead_id', p_lead_id, 'status_revision', v_lead.status_revision);
end;
$$;

create or replace function public.update_lead_status(
  p_action_id uuid, p_lead_id uuid, p_status text,
  p_expected_assignment_revision bigint, p_expected_status_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_lead public.leads%rowtype; v_status public.leadlaju_lead_status;
  v_outcome public.leadlaju_assignment_outcome; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  begin v_status := lower(trim(p_status))::public.leadlaju_lead_status;
  exception when invalid_text_representation then raise exception 'Invalid lead status'; end;
  if v_status = 'new' then raise exception 'New status is server-managed'; end if;

  select result into v_result from public.action_requests where action_id = p_action_id;
  if found then return v_result; end if;
  insert into public.action_requests (action_id, actor_id, lead_id, assignment_revision, action_type)
  values (p_action_id, v_user, p_lead_id, p_expected_assignment_revision, 'status:' || v_status::text)
  on conflict (lead_id, assignment_revision, action_type) do nothing;
  if not found and not exists (select 1 from public.action_requests where action_id = p_action_id) then
    select result into v_result from public.action_requests where lead_id = p_lead_id
      and assignment_revision = p_expected_assignment_revision and action_type = 'status:' || v_status::text;
    return v_result;
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or (not leadlaju_private.is_admin(v_user) and v_lead.assigned_agent_id <> v_user)
    or v_lead.assignment_revision <> p_expected_assignment_revision
    or v_lead.status_revision <> p_expected_status_revision then
    v_result := jsonb_build_object('ok', false, 'stale', true, 'error', 'Canonical lead has changed');
    update public.action_requests set state='rejected',result=v_result,completed_at=now() where action_id=p_action_id;
    return v_result;
  end if;
  if not leadlaju_private.is_admin(v_user) and v_lead.status = 'new' then
    raise exception 'Press CALL NOW before changing status';
  end if;
  if not leadlaju_private.is_admin(v_user) and v_status in ('passed','rejected','cancelled')
    and coalesce(trim(v_lead.notes),'') = '' then raise exception 'Notes are required for this status'; end if;

  v_outcome := v_status::text::public.leadlaju_assignment_outcome;
  update public.leads set status=v_status, queue_state=v_status::text::public.leadlaju_queue_state,
    expires_at=null, status_revision=status_revision+1, status_updated_at=now(), updated_at=now()
  where id=p_lead_id returning * into v_lead;
  update public.lead_assignments set outcome=v_outcome,resolved_at=coalesce(resolved_at,now())
  where lead_id=p_lead_id and assignment_revision=p_expected_assignment_revision and outcome='pending';
  insert into public.lead_events (lead_id,actor_id,event_type,assignment_revision,status_revision)
  values (p_lead_id,v_user,'status_changed:'||v_status::text,v_lead.assignment_revision,v_lead.status_revision);
  v_result:=jsonb_build_object('ok',true,'lead_id',p_lead_id,'status',v_status,
    'assignment_revision',v_lead.assignment_revision,'status_revision',v_lead.status_revision);
  update public.action_requests set state='accepted',result=v_result,completed_at=now() where action_id=p_action_id;
  return v_result;
end;
$$;

create or replace function public.heartbeat_agent(
  p_session_started_at timestamptz, p_notification_ready boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_availability public.agent_availability%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_availability from public.agent_availability where agent_id=v_user for update;
  if v_availability.forced_offline_at is not null and p_session_started_at < v_availability.forced_offline_at then
    return jsonb_build_object('ok',false,'revoked',true,'error','Session was forced offline');
  end if;
  insert into public.agent_availability (
    agent_id,notification_ready,last_seen_at,presence_lease_until,presence_revision
  ) values (v_user,p_notification_ready,now(),now()+interval '60 minutes',1)
  on conflict (agent_id) do update set notification_ready=excluded.notification_ready,
    last_seen_at=excluded.last_seen_at,presence_lease_until=excluded.presence_lease_until,
    presence_revision=public.agent_availability.presence_revision+1,updated_at=now();
  return jsonb_build_object('ok',true,'online',true);
end;
$$;

create or replace function public.register_push_subscription(
  p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null or coalesce(trim(p_endpoint),'')='' or coalesce(trim(p_p256dh),'')=''
    or coalesce(trim(p_auth),'')='' then raise exception 'Invalid push subscription'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,user_agent,active)
  values(v_user,trim(p_endpoint),trim(p_p256dh),trim(p_auth),coalesce(p_user_agent,''),true)
  on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,
    auth=excluded.auth,user_agent=excluded.user_agent,active=true,failure_count=0,updated_at=now()
  returning id into v_id;
  update public.agent_availability set notification_ready=true,updated_at=now() where agent_id=v_user;
  return jsonb_build_object('ok',true,'subscription_id',v_id);
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_count integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.push_subscriptions set active=false,updated_at=now()
  where endpoint=trim(p_endpoint) and user_id=v_user and active;
  get diagnostics v_count=row_count;
  return jsonb_build_object('ok',true,'updated',v_count);
end;
$$;

create or replace function public.force_agent_offline(p_agent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required'; end if;
  insert into public.agent_availability(agent_id,lead_ready,notification_ready,presence_lease_until,
    forced_offline_at,presence_revision)
  values(p_agent_id,false,false,now(),now(),1)
  on conflict(agent_id) do update set lead_ready=false,notification_ready=false,
    presence_lease_until=now(),forced_offline_at=now(),presence_revision=public.agent_availability.presence_revision+1,
    updated_at=now();
  return jsonb_build_object('ok',true,'agent_id',p_agent_id);
end;
$$;

revoke all on function public.update_lead_notes(uuid,text,bigint) from public,anon;
revoke all on function public.update_lead_status(uuid,uuid,text,bigint,bigint) from public,anon;
revoke all on function public.heartbeat_agent(timestamptz,boolean) from public,anon;
revoke all on function public.register_push_subscription(text,text,text,text) from public,anon;
revoke all on function public.unregister_push_subscription(text) from public,anon;
revoke all on function public.force_agent_offline(uuid) from public,anon;
grant execute on function public.update_lead_notes(uuid,text,bigint) to authenticated;
grant execute on function public.update_lead_status(uuid,uuid,text,bigint,bigint) to authenticated;
grant execute on function public.heartbeat_agent(timestamptz,boolean) to authenticated;
grant execute on function public.register_push_subscription(text,text,text,text) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;
grant execute on function public.force_agent_offline(uuid) to authenticated;
