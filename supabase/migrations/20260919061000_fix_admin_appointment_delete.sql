alter table public.appointments
  drop constraint if exists appointments_parent_appointment_id_fkey;

alter table public.appointments
  add constraint appointments_parent_appointment_id_fkey
  foreign key (parent_appointment_id) references public.appointments(id) on delete set null;

create or replace function public.admin_delete_appointment(p_appointment_id uuid)
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

  delete from public.appointments where id = p_appointment_id;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok', v_deleted = 1,
    'deleted', v_deleted,
    'error', case when v_deleted = 1 then null else 'Appointment not found' end
  );
end;
$$;

revoke all on function public.admin_delete_appointment(uuid) from public, anon;
grant execute on function public.admin_delete_appointment(uuid) to authenticated;
