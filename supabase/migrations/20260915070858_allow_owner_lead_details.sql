create or replace function public.admin_update_lead_details(
  p_lead_id uuid, p_name text, p_phone text, p_email text, p_project_name text, p_notes text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v_row public.leads%rowtype;
begin
  if auth.uid() is null or not exists(
    select 1 from public.leads where id=p_lead_id
      and (assigned_agent_id=auth.uid() or leadlaju_private.is_admin(auth.uid()))
  ) then raise exception 'Lead not available'; end if;
  select id into v_project from public.projects where lower(name)=lower(trim(p_project_name));
  if v_project is null then raise exception 'Project not found'; end if;
  update public.leads set name=trim(p_name),phone=trim(p_phone),email=trim(coalesce(p_email,'')),
    project_id=v_project,notes=coalesce(p_notes,''),updated_at=now()
  where id=p_lead_id returning * into v_row;
  if not found then raise exception 'Lead not found'; end if;
  return jsonb_build_object('ok',true,'lead',to_jsonb(v_row));
end;
$$;
