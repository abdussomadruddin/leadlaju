-- Preserve historical enums/outcomes; Passed is no longer a current lead status.
do $$
declare definition text; previous text := 'lower(trim(p_status))::public.leadlaju_lead_status';
begin
  definition := pg_get_functiondef('public.update_lead_status(uuid,uuid,text,bigint,bigint)'::regprocedure);
  if position(previous in definition)=0 then raise exception 'Unexpected update_lead_status definition'; end if;
  execute replace(definition,previous,
    '(case when lower(trim(p_status)) = ''passed'' then ''rejected'' else lower(trim(p_status)) end)::public.leadlaju_lead_status');
end;
$$;
create or replace function leadlaju_private.normalize_retired_passed_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'passed' then new.status := 'rejected'; end if;
  if new.queue_state = 'passed' then new.queue_state := 'rejected'; end if;
  return new;
end;
$$;
revoke all on function leadlaju_private.normalize_retired_passed_status() from public, anon, authenticated;
create trigger normalize_retired_passed_status
before insert or update of status, queue_state on public.leads
for each row execute function leadlaju_private.normalize_retired_passed_status();

with changed as (
  update public.leads set status='rejected', queue_state='rejected',
    status_revision=status_revision+1, status_updated_at=now(), updated_at=now()
  where status='passed'
  returning id, brand_id, assignment_revision, status_revision
)
insert into public.lead_events(lead_id,brand_id,event_type,assignment_revision,status_revision,payload)
select id,brand_id,'status_changed:rejected',assignment_revision,status_revision,
  jsonb_build_object('previous_status','passed','reason','Passed merged into Rejected') from changed;

alter table public.leads add constraint leads_no_retired_passed_status
check (status <> 'passed' and queue_state <> 'passed');
