alter table public.notification_outbox add column if not exists dedupe_key text;
create unique index if not exists notification_outbox_dedupe_key_unique
on public.notification_outbox (dedupe_key) where dedupe_key is not null;

create or replace function public.broadcast_follow_up_reminder(p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_name text;
begin
  if not leadlaju_private.is_admin(v_user) then raise exception 'Admin required'; end if;
  if coalesce(trim(p_message),'')='' then raise exception 'Message required'; end if;
  select name into v_name from public.profiles where id=v_user;
  insert into public.reminders(created_by_id,target,message)
  values(v_user,'agents',trim(p_message)) returning id into v_id;

  insert into public.notification_outbox(
    user_id,notification_type,payload,dedupe_key
  )
  select p.id,'admin_follow_up',jsonb_build_object(
    'title','Admin remind follow up',
    'body',coalesce(v_name,'Admin')||': '||trim(p_message),
    'tag','leadlaju-admin-reminder-'||v_id::text,
    'view','leads','url','/?view=leads','requireInteraction',true
  ),'admin_follow_up:'||v_id::text||':'||p.id::text
  from public.profiles p
  where p.role='agent' and p.active and p.approval_status='approved'
  on conflict do nothing;

  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

drop function if exists public.claim_notification_outbox(integer);
create function public.claim_notification_outbox(p_limit integer default 20)
returns table(
  outbox_id bigint, notification_type text, payload jsonb, endpoint text,
  p256dh text, auth_secret text, subscription_id uuid, user_id uuid
) language plpgsql security definer set search_path = '' as $$
begin
  return query
  with claimed as (
    select n.id from public.notification_outbox n
    where n.sent_at is null and n.available_at<=now()
      and (n.claimed_at is null or n.claimed_at<now()-interval '2 minutes')
    order by n.available_at,n.id
    for update skip locked limit greatest(1,least(coalesce(p_limit,20),100))
  ), marked as (
    update public.notification_outbox n set claimed_at=now(),attempts=n.attempts+1
    from claimed c where n.id=c.id
    returning n.id,n.notification_type,n.user_id,n.payload
  )
  select m.id,m.notification_type,m.payload,s.endpoint,s.p256dh,s.auth,s.id,m.user_id
  from marked m left join public.push_subscriptions s on s.user_id=m.user_id and s.active
  order by m.id,s.id;
end;
$$;
revoke all on function public.claim_notification_outbox(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_outbox(integer) to service_role;

create or replace function leadlaju_private.enqueue_due_operational_notifications(
  p_now timestamptz default now()
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_appointment public.appointments%rowtype;
  v_slot record;
  v_user_id uuid;
  v_lead_name text;
  v_inserted integer := 0;
  v_count integer;
  v_date_key text := to_char(p_now at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD');
begin
  for v_appointment in
    select * from public.appointments
    where status='scheduled' and scheduled_at between p_now-interval '15 minutes' and p_now+interval '3 days 15 minutes'
    for update skip locked
  loop
    select name into v_lead_name from public.leads where id=v_appointment.lead_id;
    for v_slot in select * from (values
      ('agent_3_days',interval '3 days','agent','3 hari'),
      ('agent_1_day',interval '1 day','agent','1 hari'),
      ('admin_1_day',interval '1 day','admin','1 hari'),
      ('agent_4_hours',interval '4 hours','agent','4 jam'),
      ('agent_30_minutes',interval '30 minutes','agent','30 minit')
    ) slots(slot_key,offset_value,target_role,label)
    loop
      if v_appointment.reminder_state ? v_slot.slot_key then continue; end if;
      if p_now < v_appointment.scheduled_at-v_slot.offset_value
        or p_now-(v_appointment.scheduled_at-v_slot.offset_value)>interval '15 minutes' then continue; end if;

      for v_user_id in
        select p.id from public.profiles p
        where p.active and p.approval_status='approved' and (
          (v_slot.target_role='agent' and p.id=v_appointment.assigned_agent_id)
          or (v_slot.target_role='admin' and p.role='admin')
        )
      loop
        insert into public.notification_outbox(user_id,notification_type,payload,dedupe_key)
        values(v_user_id,'appointment_reminder',jsonb_build_object(
          'title','Reminder '||v_appointment.type||': '||v_slot.label,
          'body',coalesce(v_lead_name,'Lead')||E'\n'||to_char(v_appointment.scheduled_at at time zone 'Asia/Kuala_Lumpur','DD/MM/YYYY HH24:MI')||
            case when v_appointment.location<>'' then E'\n'||v_appointment.location else '' end,
          'tag','leadlaju-appointment-'||v_appointment.id::text||'-'||v_slot.slot_key,
          'view','appointments','url','/?view=appointments&appointment='||v_appointment.id::text,
          'requireInteraction',true
        ),'appointment:'||v_appointment.id::text||':'||v_slot.slot_key||':'||v_user_id::text)
        on conflict do nothing;
        get diagnostics v_count=row_count; v_inserted:=v_inserted+v_count;
      end loop;
      v_appointment.reminder_state:=v_appointment.reminder_state||jsonb_build_object(v_slot.slot_key,p_now);
    end loop;
    update public.appointments set reminder_state=v_appointment.reminder_state,updated_at=p_now
    where id=v_appointment.id;
  end loop;

  if extract(hour from p_now at time zone 'Asia/Kuala_Lumpur')=8
    and extract(minute from p_now at time zone 'Asia/Kuala_Lumpur')<15 then
    for v_user_id,v_count in
      select l.assigned_agent_id,count(*)::integer from public.leads l
      join public.profiles p on p.id=l.assigned_agent_id
      where l.status='potential' and p.role='agent' and p.active and p.approval_status='approved'
        and exists(select 1 from public.push_subscriptions s where s.user_id=p.id and s.active)
      group by l.assigned_agent_id
    loop
      insert into public.notification_outbox(user_id,notification_type,payload,dedupe_key)
      values(v_user_id,'potential_reminder',jsonb_build_object(
        'title','Prospek panas menunggu',
        'body','Anda ada '||v_count||' lead Potential. Rugi jika tidak follow up - prospek ini dah satu langkah lagi untuk close.',
        'tag','leadlaju-potential-'||v_date_key||'-'||v_user_id::text,
        'view','leads','url','/?view=leads&reminder=potential',
        'reminderType','potential','potentialCount',v_count,'requireInteraction',true
      ),'potential:'||v_date_key||':'||v_user_id::text)
      on conflict do nothing;
      get diagnostics v_count=row_count; v_inserted:=v_inserted+v_count;
    end loop;
  end if;
  return v_inserted;
end;
$$;

revoke all on function leadlaju_private.enqueue_due_operational_notifications(timestamptz)
from public,anon,authenticated;

select cron.unschedule(jobid) from cron.job where jobname='leadlaju-operational-reminders';
select cron.schedule(
  'leadlaju-operational-reminders','* * * * *',
  $$select leadlaju_private.enqueue_due_operational_notifications(clock_timestamp())$$
);
