-- One reminder per hour, six reminders, then automatic Show Up one hour later.
-- Old appointments start their reminder sequence on the first scheduler run;
-- an outage cannot enqueue all six reminders at once.
create or replace function leadlaju_private.process_appointment_outcomes(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  ap public.appointments%rowtype;
  reminder_count integer;
  last_reminder timestamptz;
  processed integer := 0;
begin
  for ap in select * from public.appointments
    where status = 'scheduled' and scheduled_at + interval '2 hours' <= p_now
      and assigned_agent_id is not null
      and not exists (select 1 from public.appointments child where child.parent_appointment_id = appointments.id)
    for update skip locked
  loop
    reminder_count := coalesce((ap.reminder_state->>'outcome_count')::integer, 0);
    last_reminder := (ap.reminder_state->>'outcome_last_at')::timestamptz;
    if (ap.reminder_state->>'outcome_scheduled_at')::timestamptz is distinct from ap.scheduled_at then
      reminder_count := 0;
      last_reminder := null;
    end if;
    if last_reminder is not null and p_now < last_reminder + interval '1 hour' then continue; end if;
    if reminder_count >= 6 then
      update public.appointments set status = 'show_up', updated_at = p_now,
        reminder_state = reminder_state || jsonb_build_object('outcome_auto_show_up_at', p_now)
      where id = ap.id and status = 'scheduled';
      processed := processed + 1;
      continue;
    end if;
    if not exists (select 1 from public.profiles where id = ap.assigned_agent_id and role = 'agent' and active and approval_status = 'approved') then continue; end if;
    reminder_count := reminder_count + 1;
    insert into public.notification_outbox(user_id, notification_type, payload, dedupe_key)
    values (ap.assigned_agent_id, 'appointment_reminder', jsonb_build_object(
      'title', 'Kemas kini status temujanji (' || reminder_count || '/6)',
      'body', 'Waktu temujanji telah berlalu. Sila pilih Show Up atau No Show. Selepas enam reminder, status akan ditukar kepada Show Up secara automatik.',
      'tag', 'leadlaju-appointment-outcome-' || ap.id::text,
      'view', 'appointments', 'url', '/?view=appointments&appointment=' || ap.id::text,
      'requireInteraction', true
    ), 'appointment-outcome:' || ap.id::text || ':' || ap.scheduled_at::text || ':' || reminder_count)
    on conflict do nothing;
    update public.appointments set reminder_state = reminder_state || jsonb_build_object(
      'outcome_count', reminder_count, 'outcome_last_at', p_now, 'outcome_scheduled_at', ap.scheduled_at), updated_at = p_now
    where id = ap.id;
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;
revoke all on function leadlaju_private.process_appointment_outcomes(timestamptz) from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'leadlaju-appointment-outcomes';
select cron.schedule('leadlaju-appointment-outcomes', '* * * * *',
  $$select leadlaju_private.process_appointment_outcomes(clock_timestamp())$$);
