create or replace function public.admin_upsert_project(p_project jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_row public.projects%rowtype;
begin
  if not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required'; end if;
  if coalesce(trim(p_project->>'name'),'')='' then raise exception 'Project name required'; end if;
  v_id:=nullif(p_project->>'id','')::uuid;
  insert into public.projects(id,source_project_id,name,active,created_at,updated_at)
  values(coalesce(v_id,gen_random_uuid()),nullif(p_project->>'source_project_id',''),trim(p_project->>'name'),
    coalesce((p_project->>'active')::boolean,true),coalesce((p_project->>'created_at')::timestamptz,now()),now())
  on conflict(id) do update set name=excluded.name,active=excluded.active,updated_at=now()
  returning * into v_row;
  return jsonb_build_object('ok',true,'project',to_jsonb(v_row));
end;
$$;

create or replace function public.admin_update_agent(
  p_agent_id uuid, p_name text, p_phone text, p_email text, p_active boolean, p_project_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.profiles%rowtype;
begin
  if not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required'; end if;
  if coalesce(trim(p_name),'')='' or coalesce(trim(p_phone),'')='' or coalesce(trim(p_email),'')='' then
    raise exception 'Agent details required';
  end if;
  if coalesce(array_length(p_project_ids,1),0)=0 then raise exception 'At least one project required'; end if;
  if exists(select 1 from unnest(p_project_ids) project_id left join public.projects p on p.id=project_id and p.active where p.id is null) then
    raise exception 'Invalid project';
  end if;
  update public.profiles set name=trim(p_name),phone=trim(p_phone),email=lower(trim(p_email)),active=p_active,updated_at=now()
  where id=p_agent_id and role='agent' returning * into v_row;
  if not found then raise exception 'Agent not found'; end if;
  delete from public.agent_project_eligibility where agent_id=p_agent_id;
  insert into public.agent_project_eligibility(agent_id,project_id)
  select p_agent_id,project_id from unnest(p_project_ids) project_id;
  return jsonb_build_object('ok',true,'profile',to_jsonb(v_row));
end;
$$;

create or replace function public.admin_update_lead_details(
  p_lead_id uuid, p_name text, p_phone text, p_email text, p_project_name text, p_notes text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v_row public.leads%rowtype;
begin
  if not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required'; end if;
  select id into v_project from public.projects where lower(name)=lower(trim(p_project_name));
  if v_project is null then raise exception 'Project not found'; end if;
  update public.leads set name=trim(p_name),phone=trim(p_phone),email=trim(coalesce(p_email,'')),
    project_id=v_project,notes=coalesce(p_notes,''),updated_at=now()
  where id=p_lead_id returning * into v_row;
  if not found then raise exception 'Lead not found'; end if;
  return jsonb_build_object('ok',true,'lead',to_jsonb(v_row));
end;
$$;

create or replace function public.admin_delete_lead(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_deleted integer;
begin
  if not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required'; end if;
  delete from public.leads where id=p_lead_id;
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('ok',true,'deleted',v_deleted);
end;
$$;

revoke all on function public.admin_upsert_project(jsonb) from public,anon;
revoke all on function public.admin_update_agent(uuid,text,text,text,boolean,uuid[]) from public,anon;
revoke all on function public.admin_update_lead_details(uuid,text,text,text,text,text) from public,anon;
revoke all on function public.admin_delete_lead(uuid) from public,anon;
grant execute on function public.admin_upsert_project(jsonb) to authenticated;
grant execute on function public.admin_update_agent(uuid,text,text,text,boolean,uuid[]) to authenticated;
grant execute on function public.admin_update_lead_details(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.admin_delete_lead(uuid) to authenticated;
