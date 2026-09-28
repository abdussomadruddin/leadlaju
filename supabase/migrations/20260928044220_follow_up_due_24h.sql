-- Follow Up Due and push eligibility both begin 24 hours after the last qualifying activity.
-- Existing 08:00/16:00 Malaysia reminder slots and per-slot deduplication stay unchanged.

create or replace function public.get_follow_up_due()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.profiles
    where id = v_user and active and approval_status = 'approved'
  ) then raise exception 'Account is not active'; end if;

  v_is_admin := leadlaju_private.is_admin(v_user);
  return jsonb_build_object(
    'server_now', now(),
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'phone', l.phone,
        'email', l.email,
        'city', l.city,
        'notes', l.notes,
        'status', l.status,
        'project_id', l.project_id,
        'project', pr.name,
        'assigned_agent_id', l.assigned_agent_id,
        'assigned_agent_name', p.name,
        'assignment_revision', l.assignment_revision,
        'status_revision', l.status_revision,
        'contacted_at', l.contacted_at,
        'follow_up_activity_at', l.follow_up_activity_at,
        'due_at', l.follow_up_activity_at + interval '1 day',
        'notification_due_at', l.follow_up_activity_at + interval '1 day'
      ) order by l.follow_up_activity_at, l.created_at)
      from public.leads l
      join public.projects pr on pr.id = l.project_id
      left join public.profiles p on p.id = l.assigned_agent_id
      where l.status = 'contacted'
        and l.assigned_agent_id is not null
        and l.follow_up_activity_at <= now() - interval '1 day'
        and (v_is_admin or l.assigned_agent_id = v_user)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_follow_up_notification_count(p_agent_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.leads
  where assigned_agent_id = p_agent_id
    and status = 'contacted'
    and follow_up_activity_at <= now() - interval '1 day';
$$;

create or replace function leadlaju_private.enqueue_follow_up_due_notifications(
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Kuala_Lumpur';
  v_slot text;
  v_date_key text;
  v_agent_id uuid;
  v_count integer;
  v_inserted integer := 0;
  v_row_count integer;
begin
  if extract(minute from v_local) >= 15 or extract(hour from v_local) not in (8, 16) then
    return 0;
  end if;

  v_slot := case when extract(hour from v_local) = 8 then '08:00' else '16:00' end;
  v_date_key := to_char(v_local, 'YYYY-MM-DD');

  for v_agent_id, v_count in
    select l.assigned_agent_id, count(*)::integer
    from public.leads l
    join public.profiles p on p.id = l.assigned_agent_id
    where l.status = 'contacted'
      and l.follow_up_activity_at <= p_now - interval '1 day'
      and p.role = 'agent'
      and p.active
      and p.approval_status = 'approved'
      and exists (
        select 1 from public.push_subscriptions ps
        where ps.user_id = p.id and ps.active
      )
    group by l.assigned_agent_id
  loop
    insert into public.notification_outbox (
      user_id, notification_type, payload, dedupe_key
    ) values (
      v_agent_id,
      'follow_up_due',
      jsonb_build_object(
        'title', 'Follow Up Due',
        'body', v_count || case when v_count = 1 then ' lead perlu follow up.' else ' lead perlu follow up.' end,
        'tag', 'leadlaju-follow-up-due-' || v_agent_id::text,
        'view', 'follow-up-due',
        'url', '/?view=follow-up-due',
        'reminderType', 'follow_up_due',
        'followUpDueCount', v_count,
        'requireInteraction', true,
        'renotify', true
      ),
      'follow_up_due:' || v_date_key || ':' || v_slot || ':' || v_agent_id::text
    ) on conflict do nothing;
    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
  end loop;

  return v_inserted;
end;
$$;

create or replace function public.get_agent_performance_report(
  p_from date,
  p_to date,
  p_project_id uuid default null,
  p_agent_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_admin boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if v_user is null or not exists (
    select 1 from public.profiles
    where id = v_user and active and approval_status = 'approved'
  ) then raise exception 'Account is not active'; end if;
  v_admin := leadlaju_private.is_admin(v_user);
  if not v_admin and p_agent_id is not null and p_agent_id <> v_user then
    raise exception 'Agent report is private';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Invalid report date range';
  end if;
  v_start := p_from::timestamp at time zone 'Asia/Kuala_Lumpur';
  v_end := (p_to + 1)::timestamp at time zone 'Asia/Kuala_Lumpur';

  with recursive
  agents as (
    select id, name from public.profiles
    where role = 'agent' and approval_status <> 'rejected'
      and (v_admin or id = v_user)
      and (p_agent_id is null or id = p_agent_id)
  ),
  assignment_rows as (
    select la.agent_id, la.lead_id, la.assigned_at,
      la.outcome = 'contacted' and la.resolved_at is not null as contacted,
      la.outcome = 'contacted' and la.resolved_at >= la.assigned_at
        and la.resolved_at <= la.assigned_at + interval '5 minutes' as within_five,
      date_trunc('week', la.assigned_at at time zone 'Asia/Kuala_Lumpur')::date as week_start
    from public.lead_assignments la
    join public.leads l on l.id = la.lead_id
    join agents ag on ag.id = la.agent_id
    where la.assigned_at >= v_start and la.assigned_at < v_end
      and (p_project_id is null or l.project_id = p_project_id)
  ),
  appointment_chain as (
    select a.id, a.id as root_id, a.created_at as root_created_at,
      a.assigned_agent_id as root_agent_id, a.lead_id, a.status, a.created_at, 0 as depth
    from public.appointments a where a.parent_appointment_id is null
    union all
    select child.id, chain.root_id, chain.root_created_at, chain.root_agent_id,
      chain.lead_id, child.status, child.created_at, chain.depth + 1
    from public.appointments child
    join appointment_chain chain on child.parent_appointment_id = chain.id
    where chain.depth < 20
  ),
  latest_appointments as (
    select distinct on (root_id) root_id, root_created_at, root_agent_id,
      lead_id, status
    from appointment_chain
    order by root_id, depth desc, created_at desc
  ),
  appointment_rows as (
    select ap.root_agent_id as agent_id, ap.lead_id, ap.status = 'show_up' as show_up,
      date_trunc('week', ap.root_created_at at time zone 'Asia/Kuala_Lumpur')::date as week_start
    from latest_appointments ap
    join public.leads l on l.id = ap.lead_id
    join agents ag on ag.id = ap.root_agent_id
    where ap.root_created_at >= v_start and ap.root_created_at < v_end
      and (p_project_id is null or l.project_id = p_project_id)
  ),
  assignment_totals as (
    select agent_id, count(*)::integer as assignments,
      count(*) filter (where contacted)::integer as contacted,
      count(*) filter (where within_five)::integer as within_five
    from assignment_rows group by agent_id
  ),
  lead_status_rows as (
    select distinct ar.agent_id, ar.lead_id, l.status,
      ar.week_start
    from assignment_rows ar
    join public.leads l on l.id = ar.lead_id and l.assigned_agent_id = ar.agent_id
  ),
  lead_status_totals as (
    select agent_id,
      count(distinct lead_id) filter (where status = 'contacted')::integer as total_contacted,
      count(distinct lead_id) filter (where status in ('need_follow_up', 'all_offer_presented'))::integer as total_follow_up,
      count(distinct lead_id) filter (where status = 'potential')::integer as total_potential,
      count(distinct lead_id) filter (where status in ('cancelled', 'rejected'))::integer as total_cancelled_rejected,
      count(distinct lead_id) filter (where status = 'client')::integer as total_client
    from lead_status_rows group by agent_id
  ),
  appointment_totals as (
    select agent_id, count(*)::integer as appointments,
      count(*) filter (where show_up)::integer as show_ups
    from appointment_rows group by agent_id
  ),
  due_totals as (
    select l.assigned_agent_id as agent_id, count(*)::integer as due_now
    from public.leads l join agents ag on ag.id = l.assigned_agent_id
    where l.status = 'contacted'
      and l.follow_up_activity_at <= now() - interval '1 day'
      and (p_project_id is null or l.project_id = p_project_id)
    group by l.assigned_agent_id
  ),
  weekly_assignment as (
    select agent_id, week_start, count(*)::integer as assignments,
      count(*) filter (where contacted)::integer as contacted,
      count(*) filter (where within_five)::integer as within_five
    from assignment_rows group by agent_id, week_start
  ),
  weekly_appointment as (
    select agent_id, week_start, count(*)::integer as appointments,
      count(*) filter (where show_up)::integer as show_ups
    from appointment_rows group by agent_id, week_start
  ),
  weekly_lead_status as (
    select agent_id, week_start,
      count(distinct lead_id) filter (where status = 'contacted')::integer as total_contacted,
      count(distinct lead_id) filter (where status in ('need_follow_up', 'all_offer_presented'))::integer as total_follow_up,
      count(distinct lead_id) filter (where status = 'potential')::integer as total_potential,
      count(distinct lead_id) filter (where status in ('cancelled', 'rejected'))::integer as total_cancelled_rejected,
      count(distinct lead_id) filter (where status = 'client')::integer as total_client
    from lead_status_rows group by agent_id, week_start
  ),
  weekly_keys as (
    select agent_id, week_start from weekly_assignment
    union select agent_id, week_start from weekly_appointment
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'generated_at', now(),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'agent_id', ag.id, 'agent_name', ag.name,
      'assignments', coalesce(ass_tot.assignments, 0),
      'total_contacted', coalesce(lst.total_contacted, 0),
      'total_follow_up', coalesce(lst.total_follow_up, 0),
      'total_potential', coalesce(lst.total_potential, 0),
      'total_cancelled_rejected', coalesce(lst.total_cancelled_rejected, 0),
      'total_client', coalesce(lst.total_client, 0),
      'contacted', coalesce(ass_tot.contacted, 0),
      'within_five', coalesce(ass_tot.within_five, 0),
      'appointments', coalesce(pt.appointments, 0),
      'show_ups', coalesce(pt.show_ups, 0),
      'due_now', coalesce(dt.due_now, 0)
    ) order by ag.name) from agents ag
      left join assignment_totals ass_tot on ass_tot.agent_id = ag.id
      left join lead_status_totals lst on lst.agent_id = ag.id
      left join appointment_totals pt on pt.agent_id = ag.id
      left join due_totals dt on dt.agent_id = ag.id), '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object(
      'agent_id', wk.agent_id, 'week_start', wk.week_start,
      'assignments', coalesce(wa.assignments, 0),
      'total_contacted', coalesce(wls.total_contacted, 0),
      'total_follow_up', coalesce(wls.total_follow_up, 0),
      'total_potential', coalesce(wls.total_potential, 0),
      'total_cancelled_rejected', coalesce(wls.total_cancelled_rejected, 0),
      'total_client', coalesce(wls.total_client, 0),
      'contacted', coalesce(wa.contacted, 0),
      'within_five', coalesce(wa.within_five, 0),
      'appointments', coalesce(wp.appointments, 0),
      'show_ups', coalesce(wp.show_ups, 0)
    ) order by wk.week_start, wk.agent_id) from weekly_keys wk
      left join weekly_assignment wa using (agent_id, week_start)
      left join weekly_lead_status wls using (agent_id, week_start)
      left join weekly_appointment wp using (agent_id, week_start)), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_follow_up_due() from public, anon;
grant execute on function public.get_follow_up_due() to authenticated;
revoke all on function public.get_follow_up_notification_count(uuid) from public, anon, authenticated;
grant execute on function public.get_follow_up_notification_count(uuid) to service_role;
revoke all on function leadlaju_private.enqueue_follow_up_due_notifications(timestamptz) from public, anon, authenticated;
revoke all on function public.get_agent_performance_report(date, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_agent_performance_report(date, date, uuid, uuid) to authenticated;
