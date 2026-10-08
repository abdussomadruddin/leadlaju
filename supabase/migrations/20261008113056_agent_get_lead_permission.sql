-- Permission is independent of account access and defaults to existing behaviour.
alter table public.profiles add column get_lead_allowed boolean not null default true;

create function leadlaju_private.guard_get_lead_permission() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.get_lead_allowed is distinct from old.get_lead_allowed then
    if auth.uid() is not null and not leadlaju_private.is_admin(auth.uid()) then
      raise exception 'Admin required' using errcode='42501';
    end if;
    if new.role <> 'agent' or not exists(select 1 from public.brands where id=new.brand_id and distribution_mode='agent') then
      raise exception 'Only Agent-mode accounts support GET LEAD permission';
    end if;
    if not new.get_lead_allowed then
      update public.agent_availability set lead_ready=false,updated_at=now(),presence_revision=presence_revision+1 where agent_id=new.id;
    end if;
  end if;
  return new;
end $$;
create trigger guard_get_lead_permission before update of get_lead_allowed on public.profiles
for each row execute function leadlaju_private.guard_get_lead_permission();

create function leadlaju_private.guard_get_lead_readiness() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.lead_ready and exists(select 1 from public.profiles p join public.brands b on b.id=p.brand_id
    where p.id=new.agent_id and b.distribution_mode='agent' and not p.get_lead_allowed) then
    new.lead_ready:=false;
  end if;
  return new;
end $$;
create trigger guard_get_lead_readiness before insert or update on public.agent_availability
for each row execute function leadlaju_private.guard_get_lead_readiness();
revoke all on function leadlaju_private.guard_get_lead_permission(),leadlaju_private.guard_get_lead_readiness() from public,anon,authenticated;

grant create on schema public to leadlaju_tenant_executor;
create function public.admin_set_agent_get_lead_permission(p_agent_id uuid,p_allowed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.profiles;
begin
  if auth.uid() is null or not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required' using errcode='42501'; end if;
  if p_allowed is null then raise exception 'Permission required'; end if;
  -- Same first lock as dispatch: no new assignment may race a completed revocation.
  perform 1 from public.dispatch_state where brand_id=leadlaju_private.request_brand() for update;
  select * into a from public.profiles where id=p_agent_id and brand_id=leadlaju_private.request_brand() for update;
  if not found or a.role<>'agent' then raise exception 'Agent not found' using errcode='42501'; end if;
  if not exists(select 1 from public.brands where id=a.brand_id and distribution_mode='agent') then raise exception 'Agent mode required'; end if;
  update public.profiles set get_lead_allowed=p_allowed,updated_at=now() where id=a.id;
  insert into public.master_audit_log(actor_id,brand_id,action,target_id,details)
    values(auth.uid(),a.brand_id,'agent_get_lead_permission',a.id,jsonb_build_object('allowed',p_allowed));
  return jsonb_build_object('ok',true,'get_lead_allowed',p_allowed);
end $$;
alter function public.admin_set_agent_get_lead_permission(uuid,boolean) owner to leadlaju_tenant_executor;
revoke create on schema public from leadlaju_tenant_executor;
revoke all on function public.admin_set_agent_get_lead_permission(uuid,boolean) from public,anon;
grant execute on function public.admin_set_agent_get_lead_permission(uuid,boolean) to authenticated;
-- Audit table is global; writes are constrained by the checked RPC, not client grants.
grant insert on public.master_audit_log to leadlaju_tenant_executor;
grant usage,select on sequence public.master_audit_log_id_seq to leadlaju_tenant_executor;
create policy get_lead_permission_audit on public.master_audit_log for insert to leadlaju_tenant_executor
with check(actor_id=auth.uid() and brand_id=(select leadlaju_private.request_brand()) and action='agent_get_lead_permission');

do $$
declare definition text; signature text;
begin
  definition:=pg_get_functiondef('public.get_dashboard_state()'::regprocedure);
  if position('''active'', p.active' in definition)=0 then raise exception 'Dashboard profile shape changed'; end if;
  execute replace(definition,'''active'', p.active','''get_lead_allowed'', p.get_lead_allowed, ''active'', p.active');
  definition:=pg_get_functiondef('public.set_agent_availability(boolean,boolean)'::regprocedure);
  if position('if p_ready and not v_phone_notification_ready then' in definition)=0 then raise exception 'Availability shape changed'; end if;
  execute replace(definition,'if p_ready and not v_phone_notification_ready then',
    'if p_ready and exists(select 1 from public.profiles where id=v_user and not get_lead_allowed) then raise exception ''GET LEAD access is closed by admin'' using errcode=''42501''; end if; if p_ready and not v_phone_notification_ready then');
  definition:=pg_get_functiondef('leadlaju_private.dispatch_available_leads_agent_brand(timestamptz)'::regprocedure);
  if position('p.active' in definition)=0 then raise exception 'Dispatch eligibility shape changed'; end if;
  execute replace(definition,'p.active','p.active and p.get_lead_allowed');
  definition:=pg_get_functiondef('public.admin_set_all_agent_lead_readiness(boolean)'::regprocedure);
  execute replace(definition,'and p.active','and p.active and p.get_lead_allowed');
  definition:=pg_get_functiondef('public.admin_set_agent_lead_readiness(uuid,boolean)'::regprocedure);
  execute replace(definition,'if p_ready then','if p_ready and not v_agent.get_lead_allowed then raise exception ''GET LEAD access is closed by admin'' using errcode=''42501''; end if; if p_ready then');
  -- Readiness mutations must take the dispatch lock before availability rows,
  -- matching the permission RPC instead of introducing opposite lock ordering.
  foreach signature in array array['public.set_agent_availability(boolean,boolean)',
    'public.admin_set_agent_lead_readiness(uuid,boolean)', 'public.admin_set_all_agent_lead_readiness(boolean)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if position(E'begin\n' in definition)=0 then raise exception 'Readiness body changed: %',signature; end if;
    execute replace(definition,E'begin\n',E'begin\n  perform 1 from public.dispatch_state where brand_id=leadlaju_private.request_brand() for update;\n');
  end loop;
end $$;
