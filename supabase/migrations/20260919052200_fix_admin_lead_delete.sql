alter table public.action_requests
  drop constraint if exists action_requests_lead_id_fkey;

alter table public.action_requests
  add constraint action_requests_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete cascade;

alter table public.ingestion_events
  drop constraint if exists ingestion_events_lead_id_fkey;

alter table public.ingestion_events
  add constraint ingestion_events_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete set null;

create or replace function public.admin_delete_lead(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not leadlaju_private.is_admin(auth.uid()) then
    raise exception 'Admin required';
  end if;

  delete from public.leads where id = p_lead_id;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok', v_deleted = 1,
    'deleted', v_deleted,
    'error', case when v_deleted = 1 then null else 'Lead not found' end
  );
end;
$$;

revoke all on function public.admin_delete_lead(uuid) from public, anon;
grant execute on function public.admin_delete_lead(uuid) to authenticated;
