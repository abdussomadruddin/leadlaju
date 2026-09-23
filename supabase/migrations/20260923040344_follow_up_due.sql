alter table public.leads
  add column if not exists follow_up_activity_at timestamptz;

update public.leads
set follow_up_activity_at = greatest(
  coalesce(updated_at, '-infinity'::timestamptz),
  coalesce(status_updated_at, '-infinity'::timestamptz),
  coalesce(contacted_at, '-infinity'::timestamptz)
)
where status = 'contacted' and follow_up_activity_at is null;

create index if not exists leads_follow_up_due_idx
on public.leads (assigned_agent_id, follow_up_activity_at)
where status = 'contacted' and assigned_agent_id is not null;

create or replace function leadlaju_private.track_follow_up_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'contacted' and old.status is distinct from new.status then
    new.follow_up_activity_at := now();
  elsif new.status = 'contacted' and old.notes is distinct from new.notes then
    new.follow_up_activity_at := now();
  elsif old.status = 'contacted' and new.status <> 'contacted' then
    new.follow_up_activity_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_track_follow_up_activity on public.leads;
create trigger leads_track_follow_up_activity
before update of status, notes on public.leads
for each row execute function leadlaju_private.track_follow_up_activity();

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
        'due_at', l.follow_up_activity_at + interval '2 days',
        'notification_due_at', l.follow_up_activity_at + interval '3 days'
      ) order by l.follow_up_activity_at, l.created_at)
      from public.leads l
      join public.projects pr on pr.id = l.project_id
      left join public.profiles p on p.id = l.assigned_agent_id
      where l.status = 'contacted'
        and l.assigned_agent_id is not null
        and l.follow_up_activity_at <= now() - interval '2 days'
        and (v_is_admin or l.assigned_agent_id = v_user)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_follow_up_due() from public, anon;
grant execute on function public.get_follow_up_due() to authenticated;

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
    and follow_up_activity_at <= now() - interval '3 days';
$$;

revoke all on function public.get_follow_up_notification_count(uuid)
from public, anon, authenticated;
grant execute on function public.get_follow_up_notification_count(uuid) to service_role;

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
      and l.follow_up_activity_at <= p_now - interval '3 days'
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

revoke all on function leadlaju_private.enqueue_follow_up_due_notifications(timestamptz)
from public, anon, authenticated;

do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'leadlaju-follow-up-due-reminders'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'leadlaju-follow-up-due-reminders',
  '* * * * *',
  $$select leadlaju_private.enqueue_follow_up_due_notifications(clock_timestamp())$$
);
