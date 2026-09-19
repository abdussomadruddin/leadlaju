create or replace function public.admin_set_all_agent_lead_readiness(
  p_ready boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if not leadlaju_private.is_admin(auth.uid()) then
    raise exception 'Admin required';
  end if;

  if p_ready then
    update public.agent_availability av
    set lead_ready = true,
        notification_ready = true,
        presence_revision = av.presence_revision + 1,
        updated_at = now()
    from public.profiles p
    where p.id = av.agent_id
      and p.role = 'agent'
      and p.active
      and p.approval_status = 'approved'
      and av.presence_lease_until > now()
      and not av.lead_ready
      and exists (
        select 1
        from public.push_subscriptions ps
        where ps.user_id = av.agent_id and ps.active
      );
    get diagnostics v_updated = row_count;

    if v_updated > 0 then
      perform leadlaju_private.dispatch_available_leads(now());
    end if;
  else
    update public.agent_availability av
    set lead_ready = false,
        presence_revision = av.presence_revision + 1,
        updated_at = now()
    from public.profiles p
    where p.id = av.agent_id
      and p.role = 'agent'
      and p.active
      and p.approval_status = 'approved'
      and av.lead_ready;
    get diagnostics v_updated = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead_ready', p_ready,
    'updated', v_updated
  );
end;
$$;

revoke all on function public.admin_set_all_agent_lead_readiness(boolean) from public, anon;
grant execute on function public.admin_set_all_agent_lead_readiness(boolean) to authenticated;
