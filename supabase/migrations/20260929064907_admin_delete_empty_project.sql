create or replace function public.admin_delete_project(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_name text;
begin
  if not leadlaju_private.is_admin(auth.uid()) then
    raise exception 'Admin required';
  end if;

  select name into v_project_name
  from public.projects
  where id = p_project_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if exists (select 1 from public.leads where project_id = p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'has_leads');
  end if;
  if exists (select 1 from public.bulletins where project_id = p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'has_bulletins');
  end if;
  if exists (select 1 from public.agent_project_eligibility where project_id = p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'has_agents');
  end if;

  delete from public.projects where id = p_project_id;
  return jsonb_build_object('ok', true, 'project_name', v_project_name);
end;
$$;

revoke all on function public.admin_delete_project(uuid) from public, anon;
grant execute on function public.admin_delete_project(uuid) to authenticated;
