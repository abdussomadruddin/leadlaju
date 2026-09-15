create or replace function leadlaju_private.broadcast_operational_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_user_id text;
  v_recipient_id text;
  v_target text;
begin
  v_user_id := coalesce(
    v_new->>'agent_id', v_old->>'agent_id',
    v_new->>'assigned_agent_id', v_old->>'assigned_agent_id'
  );
  if tg_table_name = 'profiles' then
    v_user_id := coalesce(v_new->>'id', v_old->>'id');
  end if;

  if tg_table_name = 'reminders' then
    v_target := coalesce(v_new->>'target', v_old->>'target');
    if v_target = 'agents' then
      for v_user_id in
        select id::text from public.profiles
        where role = 'agent' and active and approval_status = 'approved'
      loop
        perform realtime.broadcast_changes(
          'user:' || v_user_id, tg_op, tg_op, tg_table_name, tg_table_schema, new, old
        );
      end loop;
      v_user_id := null;
    elsif v_target is not null then
      v_user_id := v_target;
    end if;
  end if;

  if v_user_id is not null then
    perform realtime.broadcast_changes(
      'user:' || v_user_id, tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  end if;

  if tg_table_name in ('profiles', 'agent_availability', 'projects') then
    for v_recipient_id in
      select id::text from public.profiles
      where active and approval_status = 'approved'
        and id::text is distinct from v_user_id
    loop
      perform realtime.send(
        jsonb_build_object('table', tg_table_name, 'operation', tg_op),
        'state_changed',
        'user:' || v_recipient_id,
        true
      );
    end loop;
  end if;

  perform realtime.broadcast_changes(
    'admin:operations', tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists eligibility_realtime_broadcast on public.agent_project_eligibility;
create trigger eligibility_realtime_broadcast
after insert or update or delete on public.agent_project_eligibility
for each row execute function leadlaju_private.broadcast_operational_change();
