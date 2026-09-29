-- A lead becomes Follow Up Due one day after its last qualifying activity.
-- After a further 15 days in that due queue, move only still-Contacted leads
-- to Need Follow Up. The status change removes them from Follow Up Due.

create or replace function leadlaju_private.promote_stale_follow_up_due(
  p_now timestamptz default clock_timestamp()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  with changed as (
    update public.leads as l
    set status = 'need_follow_up'::public.leadlaju_lead_status,
        queue_state = 'need_follow_up'::public.leadlaju_queue_state,
        expires_at = null,
        status_revision = l.status_revision + 1,
        status_updated_at = p_now,
        updated_at = p_now
    where l.status = 'contacted'
      and l.assigned_agent_id is not null
      and l.follow_up_activity_at < p_now - interval '16 days'
    returning l.id, l.assignment_revision, l.status_revision
  )
  insert into public.lead_events (
    lead_id, event_type, assignment_revision, status_revision, payload
  )
  select id, 'status_changed:need_follow_up', assignment_revision, status_revision,
    jsonb_build_object('reason', 'follow_up_due_over_15_days')
  from changed;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function leadlaju_private.promote_stale_follow_up_due(timestamptz)
from public, anon, authenticated;

do $$
declare v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname = 'leadlaju-follow-up-auto-status'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'leadlaju-follow-up-auto-status',
  '5 * * * *',
  $$select leadlaju_private.promote_stale_follow_up_due(clock_timestamp())$$
);
