create or replace function public.admin_reset_lead_to_new(
  p_action_id uuid,
  p_lead_id uuid,
  p_expected_assignment_revision bigint,
  p_expected_status_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_lead public.leads%rowtype;
  v_result jsonb;
begin
  if not leadlaju_private.is_admin(v_user) then
    raise exception 'Admin required';
  end if;

  select result into v_result from public.action_requests where action_id = p_action_id;
  if found then return v_result; end if;

  insert into public.action_requests (
    action_id, actor_id, lead_id, assignment_revision, action_type
  ) values (
    p_action_id, v_user, p_lead_id, p_expected_assignment_revision, 'status:new'
  ) on conflict (lead_id, assignment_revision, action_type) do nothing;

  if not found and not exists (
    select 1 from public.action_requests where action_id = p_action_id
  ) then
    select result into v_result from public.action_requests
    where lead_id = p_lead_id
      and assignment_revision = p_expected_assignment_revision
      and action_type = 'status:new';
    return v_result;
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found
    or v_lead.assignment_revision <> p_expected_assignment_revision
    or v_lead.status_revision <> p_expected_status_revision then
    v_result := jsonb_build_object(
      'ok', false, 'stale', true, 'error', 'Canonical lead has changed'
    );
    update public.action_requests
    set state = 'rejected', result = v_result, completed_at = now()
    where action_id = p_action_id;
    return v_result;
  end if;

  update public.lead_assignments
  set outcome = 'passed', resolved_at = coalesce(resolved_at, now())
  where lead_id = p_lead_id and outcome = 'pending';

  update public.leads
  set status = 'new',
      queue_state = 'queued',
      assigned_agent_id = null,
      received_at = null,
      expires_at = null,
      queued_at = now(),
      pass_count = 0,
      retry_after_cycle = 0,
      assignment_revision = assignment_revision + 1,
      status_revision = status_revision + 1,
      status_updated_at = now(),
      contacted_at = null,
      response_ms = null,
      updated_at = now()
  where id = p_lead_id
  returning * into v_lead;

  insert into public.lead_events (
    lead_id, actor_id, event_type, assignment_revision, status_revision
  ) values (
    p_lead_id, v_user, 'admin_reset_to_new',
    v_lead.assignment_revision, v_lead.status_revision
  );

  perform leadlaju_private.dispatch_available_leads(now());
  select * into v_lead from public.leads where id = p_lead_id;

  v_result := jsonb_build_object(
    'ok', true,
    'lead_id', p_lead_id,
    'status', v_lead.status,
    'queue_state', v_lead.queue_state,
    'assignment_revision', v_lead.assignment_revision,
    'status_revision', v_lead.status_revision
  );
  update public.action_requests
  set state = 'accepted', result = v_result, completed_at = now()
  where action_id = p_action_id;
  return v_result;
end;
$$;

revoke all on function public.admin_reset_lead_to_new(uuid, uuid, bigint, bigint)
  from public, anon;
grant execute on function public.admin_reset_lead_to_new(uuid, uuid, bigint, bigint)
  to authenticated;
