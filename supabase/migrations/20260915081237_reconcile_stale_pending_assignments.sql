create or replace function leadlaju_private.reconcile_pending_assignment_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lead_assignments la
  set outcome = 'missed', resolved_at = coalesce(la.resolved_at, now())
  where la.outcome = 'pending'
    and (la.agent_id = new.agent_id or la.lead_id = new.lead_id)
    and not exists (
      select 1
      from public.leads l
      where l.id = la.lead_id
        and l.status = 'new'
        and l.queue_state = 'active'
        and l.assigned_agent_id = la.agent_id
        and l.assignment_revision = la.assignment_revision
    );

  return new;
end;
$$;

revoke all on function leadlaju_private.reconcile_pending_assignment_before_insert()
from public, anon, authenticated;

drop trigger if exists reconcile_pending_assignment_before_insert
on public.lead_assignments;

create trigger reconcile_pending_assignment_before_insert
before insert on public.lead_assignments
for each row execute function leadlaju_private.reconcile_pending_assignment_before_insert();

update public.lead_assignments la
set outcome = 'missed', resolved_at = coalesce(la.resolved_at, now())
where la.outcome = 'pending'
  and not exists (
    select 1
    from public.leads l
    where l.id = la.lead_id
      and l.status = 'new'
      and l.queue_state = 'active'
      and l.assigned_agent_id = la.agent_id
      and l.assignment_revision = la.assignment_revision
  );
