alter table public.leads
  add column if not exists follow_up_count integer not null default 0
  check (follow_up_count between 0 and 6);

create or replace function public.record_lead_follow_up(p_lead_id uuid, p_expected_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_lead public.leads%rowtype;
  v_next_count integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or (not leadlaju_private.is_admin(v_user) and v_lead.assigned_agent_id is distinct from v_user) then
    raise exception 'Lead not available';
  end if;
  if v_lead.status = 'new' or v_lead.queue_state = 'queued' then
    raise exception 'Press CALL NOW before Follow Up';
  end if;
  if v_lead.follow_up_count <> p_expected_count then
    return jsonb_build_object('ok', false, 'error', 'Follow Up count has changed');
  end if;
  if v_lead.follow_up_count >= 6 then
    return jsonb_build_object('ok', false, 'error', 'Maximum Follow Up 6');
  end if;
  v_next_count := v_lead.follow_up_count + 1;
  update public.leads
  set follow_up_count = v_next_count,
      status = case when v_next_count = 3 then 'all_offer_presented'::public.leadlaju_lead_status else status end,
      queue_state = case when v_next_count = 3 then 'all_offer_presented'::public.leadlaju_queue_state else queue_state end,
      status_revision = status_revision + case when v_next_count = 3 then 1 else 0 end,
      status_updated_at = case when v_next_count = 3 then now() else status_updated_at end,
      updated_at = now()
  where id = p_lead_id returning * into v_lead;
  insert into public.lead_events (lead_id, actor_id, event_type, assignment_revision, status_revision, payload)
  values (p_lead_id, v_user, 'follow_up_recorded', v_lead.assignment_revision, v_lead.status_revision,
    jsonb_build_object('follow_up_count', v_next_count));
  if v_next_count = 3 then
    insert into public.lead_events (lead_id, actor_id, event_type, assignment_revision, status_revision)
    values (p_lead_id, v_user, 'status_changed:all_offer_presented', v_lead.assignment_revision, v_lead.status_revision);
  end if;
  return jsonb_build_object('ok', true, 'follow_up_count', v_next_count,
    'status', v_lead.status, 'status_revision', v_lead.status_revision);
end;
$$;

revoke all on function public.record_lead_follow_up(uuid, integer) from public, anon;
grant execute on function public.record_lead_follow_up(uuid, integer) to authenticated;
