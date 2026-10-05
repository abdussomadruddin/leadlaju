-- Shared Follow Up Due schedule and ingress-age rule; hourly New is Team Sales only.
-- Retain old functions under explicit legacy names for rollback, but disable their slots.
create index leads_pending_contact_age_idx on public.leads(created_at,brand_id)
where status in ('new','contacted');
create index notification_daily_pending_idx on public.notification_outbox(notification_type,id)
where sent_at is null and notification_type in ('sales_contact_15','sales_contact_60','sales_contact_admin','sales_new_daily','sales_due_daily');
alter function leadlaju_private.enqueue_follow_up_due_notifications_brand(timestamptz) rename to enqueue_follow_up_due_notifications_agent_brand;
create function leadlaju_private.enqueue_follow_up_due_notifications_brand(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
begin
 return 0; -- Replaced by the grouped 09:00/15:00/21:00 schedule below.
end $$;
revoke all on function leadlaju_private.enqueue_follow_up_due_notifications_brand(timestamptz) from public,anon,authenticated;
grant execute on function leadlaju_private.enqueue_follow_up_due_notifications_brand(timestamptz) to leadlaju_tenant_executor;

alter function leadlaju_private.promote_stale_follow_up_due_brand(timestamptz) rename to promote_stale_follow_up_due_agent_brand;
create function leadlaju_private.promote_stale_follow_up_due_brand(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
begin
 return 0; -- Replaced by the shared ingress-age check below.
end $$;
revoke all on function leadlaju_private.promote_stale_follow_up_due_brand(timestamptz) from public,anon,authenticated;
grant execute on function leadlaju_private.promote_stale_follow_up_due_brand(timestamptz) to leadlaju_tenant_executor;

-- Validate current owner, revision, status, activity and slot before every retry.
-- Old age-based owner reminders and Admin summaries are deliberately invalid now.
create or replace function public.validate_sales_contact_reminder(p_user_id uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid; recipient public.profiles; items jsonb; n integer; slot_at timestamptz;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' and session_user<>'postgres' then raise exception 'Worker only' using errcode='42501'; end if;
 if p_type not in ('sales_new_daily','sales_due_daily') then return null; end if;
 bid:=(p_payload->>'brandId')::uuid;
 slot_at:=(p_payload->>'slotAt')::timestamptz;
 if slot_at is null or now()<slot_at or now()>=slot_at+interval '15 minutes' then return null; end if;
 select * into recipient from public.profiles where id=p_user_id and brand_id=bid and role='agent' and active and approval_status='approved';
 if recipient.id is null or not exists(select 1 from public.brands where id=bid and active and (p_type='sales_due_daily' or distribution_mode='team_sales')) then return null; end if;
 select jsonb_agg(x.value) into items from jsonb_array_elements(p_payload->'items') x
 join public.leads l on l.id=(x.value->>'id')::uuid
 where l.brand_id=bid and l.assigned_agent_id=p_user_id and l.assignment_revision=(x.value->>'revision')::bigint
 and l.created_at>=now()-interval '15 days'
 and ((p_type='sales_new_daily' and l.status='new') or
 (p_type='sales_due_daily' and l.status='contacted' and l.follow_up_activity_at<=now()-interval '24 hours'
 and l.follow_up_activity_at=(x.value->>'activityAt')::timestamptz));
 if items is null then return null; end if;
 n:=jsonb_array_length(items);
 return p_payload||jsonb_build_object('items',items,'body',n||case when p_type='sales_new_daily' then ' New Lead belum dihubungi.' else ' lead Contacted perlu follow up.' end);
end $$;
revoke all on function public.validate_sales_contact_reminder(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.validate_sales_contact_reminder(uuid,text,jsonb) to service_role;

create or replace function leadlaju_private.enqueue_sales_contact_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare local_time timestamp:=p_now at time zone 'Asia/Kuala_Lumpur'; recipient record; kind text; items jsonb; total integer:=0; inserted integer; slot_at timestamptz; pending record;
begin
 if auth.uid() is not null then raise exception 'Trusted scheduler required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(7100415);
 -- This rule is based on ingress time, not the last follow-up activity.
 with changed as (
 update public.leads l set status='need_follow_up',queue_state='need_follow_up',expires_at=null,
 status_revision=l.status_revision+1,status_updated_at=p_now,updated_at=p_now
 from public.brands b where b.id=l.brand_id and b.active
 and l.status in ('new','contacted') and l.created_at<p_now-interval '15 days'
 returning l.id,l.brand_id,l.assignment_revision,l.status_revision
 ), resolved as (
 update public.lead_assignments a set outcome='need_follow_up',resolved_at=p_now
 from changed c where a.lead_id=c.id and a.assignment_revision=c.assignment_revision and a.outcome='pending'
 returning a.id
 ) insert into public.lead_events(lead_id,brand_id,event_type,assignment_revision,status_revision,payload)
 select id,brand_id,'status_changed:need_follow_up',assignment_revision,status_revision,jsonb_build_object('reason','lead_age_over_15_days') from changed;
 for pending in select * from public.notification_outbox where sent_at is null and notification_type in ('sales_contact_15','sales_contact_60','sales_contact_admin','sales_new_daily','sales_due_daily') loop
 if public.validate_sales_contact_reminder(pending.user_id,pending.notification_type,pending.payload) is null then
 update public.notification_outbox set sent_at=p_now,claimed_at=null,last_error='Cancelled: reminder no longer relevant' where id=pending.id and sent_at is null;
 end if;
 end loop;
 if extract(minute from local_time)>=15 then return 0; end if;
 slot_at:=date_trunc('hour',local_time) at time zone 'Asia/Kuala_Lumpur';
 foreach kind in array array['sales_new_daily','sales_due_daily'] loop
 if (kind='sales_new_daily' and extract(hour from local_time) not in (10,11,12,13,14,15,16)) or
 (kind='sales_due_daily' and extract(hour from local_time) not in (9,15,21)) then continue; end if;
 for recipient in select p.id,p.brand_id from public.profiles p join public.brands b on b.id=p.brand_id
 where p.role='agent' and p.active and p.approval_status='approved' and b.active and (kind='sales_due_daily' or b.distribution_mode='team_sales') loop
 select jsonb_agg(jsonb_build_object('id',l.id,'revision',l.assignment_revision,'activityAt',l.follow_up_activity_at) order by l.created_at,l.id) into items
 from public.leads l where l.brand_id=recipient.brand_id and l.assigned_agent_id=recipient.id and l.created_at>=p_now-interval '15 days'
 and ((kind='sales_new_daily' and l.status='new') or (kind='sales_due_daily' and l.status='contacted' and l.follow_up_activity_at<=p_now-interval '24 hours'));
 if items is null then continue; end if;
 insert into public.notification_outbox(brand_id,user_id,notification_type,dedupe_key,payload)
 values(recipient.brand_id,recipient.id,kind,kind||':'||to_char(local_time,'YYYY-MM-DD-HH24')||':'||recipient.id,
 jsonb_build_object('brandId',recipient.brand_id,'items',items,'slotAt',slot_at,
 'title',case when kind='sales_new_daily' then 'New Leads Belum Dihubungi' else 'Lead Follow Up Due' end,
 'body',jsonb_array_length(items)||case when kind='sales_new_daily' then ' New Lead belum dihubungi.' else ' lead Contacted perlu follow up.' end,
 'tag',kind||':'||recipient.id,'view','follow-up-due','reminderType',kind,
 'url','/?view=follow-up-due&section='||case when kind='sales_new_daily' then 'new' else 'due' end)) on conflict do nothing;
 get diagnostics inserted=row_count; total:=total+inserted;
 end loop;
 end loop;
 return total;
end $$;
revoke all on function leadlaju_private.enqueue_sales_contact_reminders(timestamptz) from public,anon,authenticated,service_role;

-- Retire queued reminders from the superseded schedules for both modes.
update public.notification_outbox n set sent_at=now(),claimed_at=null,last_error='Cancelled: replaced by Team Sales daily schedule'
from public.brands b where b.id=n.brand_id and n.sent_at is null
and n.notification_type in ('sales_contact_15','sales_contact_60','sales_contact_admin','follow_up_due');
