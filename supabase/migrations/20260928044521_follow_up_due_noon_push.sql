-- Add a 12:00 Malaysia-time reminder slot, preserving 24-hour eligibility.
-- The existing every-minute cron job invokes this function; the per-slot dedupe key prevents repeats.

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
  if extract(minute from v_local) >= 15 or extract(hour from v_local) not in (8, 12, 16) then
    return 0;
  end if;

  v_slot := case extract(hour from v_local)
    when 8 then '08:00'
    when 12 then '12:00'
    else '16:00'
  end;
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

revoke all on function leadlaju_private.enqueue_follow_up_due_notifications(timestamptz)
  from public, anon, authenticated;
