create or replace function public.get_dashboard_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_is_admin boolean; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  v_is_admin := leadlaju_private.is_admin(v_user);
  if not exists (
    select 1 from public.profiles where id = v_user and active and approval_status = 'approved'
  ) then raise exception 'Account is not active'; end if;

  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'phone', case when v_is_admin or p.id=v_user then p.phone else '' end,
      'email', case when v_is_admin or p.id=v_user then p.email else '' end, 'role', p.role,
      'active', p.active, 'approval_status', p.approval_status, 'leads_handled', p.leads_handled,
      'cooldown_until', p.cooldown_until, 'created_at', p.created_at,
      'lead_ready', coalesce(av.lead_ready,false), 'notification_ready', coalesce(av.notification_ready,false),
      'last_seen_at', av.last_seen_at, 'presence_lease_until', av.presence_lease_until,
      'eligible_project_ids', coalesce((select jsonb_agg(ape.project_id order by ape.project_id)
        from public.agent_project_eligibility ape where ape.agent_id=p.id),'[]'::jsonb)
    ) order by p.created_at) from public.profiles p
      left join public.agent_availability av on av.agent_id=p.id
      where v_is_admin or (p.role='agent' and p.active and p.approval_status='approved') or p.id=v_user),'[]'::jsonb),
    'projects', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.created_at)
      from public.projects pr where pr.active or v_is_admin),'[]'::jsonb),
    'leads', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object(
      'project', pr.name,
      'assignment_history', coalesce((select jsonb_agg(jsonb_build_object(
        'agentId', la.agent_id, 'assignmentRevision', la.assignment_revision,
        'assignedAt', la.assigned_at, 'expiresAt', la.expires_at,
        'resolvedAt', la.resolved_at, 'outcome', la.outcome, 'retryCycle', la.retry_cycle
      ) order by la.assignment_revision) from public.lead_assignments la where la.lead_id=l.id),'[]'::jsonb)
    ) order by l.created_at desc) from public.leads l join public.projects pr on pr.id=l.project_id
      where v_is_admin or l.assigned_agent_id=v_user),'[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'type', e.event_type, 'lead_id', e.lead_id, 'lead_name', l.name,
      'message', coalesce(e.payload->>'message',e.event_type), 'created_at', e.created_at
    ) order by e.created_at desc) from (select * from public.lead_events order by created_at desc limit 80) e
      join public.leads l on l.id=e.lead_id where v_is_admin or l.assigned_agent_id=v_user),'[]'::jsonb),
    'appointments', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object(
      'lead_name',l.name,'project',pr.name,'assigned_agent_name',p.name
    ) order by a.scheduled_at) from public.appointments a join public.leads l on l.id=a.lead_id
      join public.projects pr on pr.id=l.project_id left join public.profiles p on p.id=a.assigned_agent_id
      where v_is_admin or a.assigned_agent_id=v_user),'[]'::jsonb),
    'latest_reminder', (select to_jsonb(r) || jsonb_build_object('created_by_name',p.name)
      from public.reminders r left join public.profiles p on p.id=r.created_by_id
      where v_is_admin or r.target in ('agents',v_user::text) order by r.created_at desc limit 1),
    'server_now', now()
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.manage_appointment(p_action text, p_appointment jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_is_admin boolean; v_lead public.leads%rowtype;
  v_id uuid; v_parent uuid; v_status text; v_row public.appointments%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  v_is_admin:=leadlaju_private.is_admin(v_user);
  v_id:=nullif(p_appointment->>'id','')::uuid;
  if p_action='create' then
    select * into v_lead from public.leads where id=(p_appointment->>'lead_id')::uuid for share;
  else
    select l.* into v_lead from public.appointments a join public.leads l on l.id=a.lead_id
      where a.id=v_id for share;
  end if;
  if not found or (not v_is_admin and v_lead.assigned_agent_id<>v_user) then raise exception 'Lead not available'; end if;
  if p_action='delete' then delete from public.appointments where id=v_id returning * into v_row;
  elsif p_action='status' then
    v_status:=p_appointment->>'status';
    if v_status not in ('scheduled','show_up','no_show','reschedule') then raise exception 'Invalid appointment status'; end if;
    update public.appointments set status=v_status,updated_at=now() where id=v_id returning * into v_row;
  elsif p_action in ('create','update','reschedule') then
    if p_action='reschedule' then v_parent:=v_id; v_id:=null; end if;
    if v_id is null then
      insert into public.appointments(lead_id,type,scheduled_at,location,notes,status,assigned_agent_id,parent_appointment_id)
      values(v_lead.id,coalesce(nullif(p_appointment->>'type',''),'Site Visit'),(p_appointment->>'scheduled_at')::timestamptz,
        coalesce(p_appointment->>'location',''),coalesce(p_appointment->>'notes',''),'scheduled',v_lead.assigned_agent_id,v_parent)
      returning * into v_row;
      if v_parent is not null then update public.appointments set status='reschedule',updated_at=now() where id=v_parent; end if;
    else
      update public.appointments set type=coalesce(nullif(p_appointment->>'type',''),type),
        scheduled_at=coalesce((p_appointment->>'scheduled_at')::timestamptz,scheduled_at),
        location=coalesce(p_appointment->>'location',location),notes=coalesce(p_appointment->>'notes',notes),updated_at=now()
      where id=v_id returning * into v_row;
    end if;
  else raise exception 'Invalid appointment action'; end if;
  return jsonb_build_object('ok',true,'appointment',to_jsonb(v_row));
end;
$$;

create or replace function public.broadcast_follow_up_reminder(p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if not leadlaju_private.is_admin(v_user) then raise exception 'Admin required'; end if;
  if coalesce(trim(p_message),'')='' then raise exception 'Message required'; end if;
  insert into public.reminders(created_by_id,target,message) values(v_user,'agents',trim(p_message)) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

revoke all on function public.get_dashboard_state() from public,anon;
revoke all on function public.manage_appointment(text,jsonb) from public,anon;
revoke all on function public.broadcast_follow_up_reminder(text) from public,anon;
grant execute on function public.get_dashboard_state() to authenticated;
grant execute on function public.manage_appointment(text,jsonb) to authenticated;
grant execute on function public.broadcast_follow_up_reminder(text) to authenticated;
