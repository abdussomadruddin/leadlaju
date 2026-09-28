-- Server-owned, role-scoped agent performance. Dates are inclusive in Malaysia time.
create index if not exists lead_assignments_agent_assigned_at_idx
  on public.lead_assignments (agent_id, assigned_at);
create index if not exists appointments_created_at_agent_idx
  on public.appointments (assigned_agent_id, created_at);

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
  appointment_totals as (
    select agent_id, count(*)::integer as appointments,
      count(*) filter (where show_up)::integer as show_ups
    from appointment_rows group by agent_id
  ),
  due_totals as (
    select l.assigned_agent_id as agent_id, count(*)::integer as due_now
    from public.leads l join agents ag on ag.id = l.assigned_agent_id
    where l.status = 'contacted'
      and l.follow_up_activity_at <= now() - interval '2 days'
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
  weekly_keys as (
    select agent_id, week_start from weekly_assignment
    union select agent_id, week_start from weekly_appointment
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'generated_at', now(),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'agent_id', ag.id, 'agent_name', ag.name,
      'assignments', coalesce(ass_tot.assignments, 0),
      'contacted', coalesce(ass_tot.contacted, 0),
      'within_five', coalesce(ass_tot.within_five, 0),
      'appointments', coalesce(pt.appointments, 0),
      'show_ups', coalesce(pt.show_ups, 0),
      'due_now', coalesce(dt.due_now, 0)
    ) order by ag.name) from agents ag
      left join assignment_totals ass_tot on ass_tot.agent_id = ag.id
      left join appointment_totals pt on pt.agent_id = ag.id
      left join due_totals dt on dt.agent_id = ag.id), '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object(
      'agent_id', wk.agent_id, 'week_start', wk.week_start,
      'assignments', coalesce(wa.assignments, 0),
      'contacted', coalesce(wa.contacted, 0),
      'within_five', coalesce(wa.within_five, 0),
      'appointments', coalesce(wp.appointments, 0),
      'show_ups', coalesce(wp.show_ups, 0)
    ) order by wk.week_start, wk.agent_id) from weekly_keys wk
      left join weekly_assignment wa using (agent_id, week_start)
      left join weekly_appointment wp using (agent_id, week_start)), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_agent_performance_report(date, date, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_agent_performance_report(date, date, uuid, uuid)
  to authenticated;
