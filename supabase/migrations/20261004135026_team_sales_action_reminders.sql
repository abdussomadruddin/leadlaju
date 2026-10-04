-- New leads only: retain all historical records and Agent behavior.
-- Staged safely: release operator activates the cutoff only after worker deploy.
create table leadlaju_private.sales_reminder_release (id boolean primary key default true check(id), activated_at timestamptz not null default 'infinity'::timestamptz);
insert into leadlaju_private.sales_reminder_release(id) values(true);
create table leadlaju_private.sales_reminder_receipts (
 lead_id uuid not null references public.leads(id) on delete cascade,
 assignment_revision bigint not null, stage text not null check(stage in ('15','60','admin')),
 primary key(lead_id,stage)
);
alter table leadlaju_private.sales_reminder_release enable row level security;
alter table leadlaju_private.sales_reminder_receipts enable row level security;
revoke all on leadlaju_private.sales_reminder_release,leadlaju_private.sales_reminder_receipts from public,anon,authenticated,service_role;

create function leadlaju_private.enqueue_sales_contact_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare lead_row record; pending record; a record; stage text; batch uuid; items jsonb; total integer:=0;
begin
 if auth.uid() is not null then raise exception 'Trusted scheduler required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(7100415);
 -- Claim filtering skips inactive recipients; explicitly retire their stale jobs.
 for pending in select * from public.notification_outbox where sent_at is null and notification_type in ('sales_contact_15','sales_contact_60','sales_contact_admin') loop
   if public.validate_sales_contact_reminder(pending.user_id,pending.notification_type,pending.payload) is null then
     update public.notification_outbox set sent_at=p_now,claimed_at=null,last_error='Cancelled: reminder no longer relevant' where id=pending.id and sent_at is null;
   end if;
 end loop;
 for lead_row in select l.* from public.leads l join public.brands b on b.id=l.brand_id and b.active and b.distribution_mode='team_sales'
 join public.profiles p on p.id=l.assigned_agent_id and p.brand_id=l.brand_id and p.role='agent' and p.active and p.approval_status='approved'
 where l.status='new' and l.queue_state='sales_assigned' and l.created_at>=(select activated_at from leadlaju_private.sales_reminder_release)
 and l.created_at<=p_now-interval '15 minutes' order by l.created_at,l.id loop
 stage:=case when lead_row.created_at<=p_now-interval '1 hour' then '60' else '15' end;
 if stage='60' then insert into leadlaju_private.sales_reminder_receipts values(lead_row.id,lead_row.assignment_revision,'15') on conflict do nothing; end if;
 insert into leadlaju_private.sales_reminder_receipts values(lead_row.id,lead_row.assignment_revision,stage) on conflict do nothing;
 if found then
 insert into public.notification_outbox(brand_id,user_id,lead_id,assignment_revision,notification_type,payload)
 values(lead_row.brand_id,lead_row.assigned_agent_id,lead_row.id,lead_row.assignment_revision,'sales_contact_'||stage,
 jsonb_build_object('brandId',lead_row.brand_id,'lead_id',lead_row.id,'assignment_revision',lead_row.assignment_revision,'owner_id',lead_row.assigned_agent_id,'title','Lead belum contact','body',case when stage='60' then 'Lead masih belum contact selepas 1 jam.' else 'Lead masih belum contact selepas 15 minit.' end,'tag','leadlaju-contact-'||lead_row.id||'-'||stage,'url','/?view=leads&lead='||lead_row.id,'view','leads','leadId',lead_row.id)) on conflict do nothing;
 total:=total+1;
 end if;
 end loop;
 -- Claim each lead once, then send one brand summary to each active Admin.
 for a in select distinct b.id from public.brands b join public.profiles p on p.brand_id=b.id and p.role='admin' and p.active and p.approval_status='approved' where b.active and b.distribution_mode='team_sales' loop
 with eligible as (
 select l.id,l.assignment_revision,l.assigned_agent_id from public.leads l join public.profiles p on p.id=l.assigned_agent_id and p.brand_id=l.brand_id and p.role='agent' and p.active and p.approval_status='approved'
 where l.brand_id=a.id and l.status='new' and l.queue_state='sales_assigned' and l.created_at>=(select activated_at from leadlaju_private.sales_reminder_release) and l.created_at<=p_now-interval '1 hour'
 ), inserted as (
 insert into leadlaju_private.sales_reminder_receipts select id,assignment_revision,'admin' from eligible on conflict do nothing returning lead_id,assignment_revision
 ) select jsonb_agg(jsonb_build_object('id',e.id,'revision',e.assignment_revision,'owner',e.assigned_agent_id)) into items from eligible e join inserted i on i.lead_id=e.id and i.assignment_revision=e.assignment_revision;
 if items is not null then
 batch:=extensions.gen_random_uuid();
 insert into public.notification_outbox(brand_id,user_id,notification_type,dedupe_key,payload)
 select a.id,p.id,'sales_contact_admin', 'sales-contact-admin:'||batch||':'||p.id,
 jsonb_build_object('brandId',a.id,'items',items,'title','New Lead belum contact','body',jsonb_array_length(items)||' lead belum contact melebihi 1 jam.','tag','leadlaju-contact-admin-'||batch,'url','/?view=leads&reminder=sales-overdue&brand='||a.id,'view','leads','reminderType','sales-overdue')
 from public.profiles p where p.brand_id=a.id and p.role='admin' and p.active and p.approval_status='approved';
 total:=total+1;
 end if;
 end loop;
 return total;
end $$;
revoke all on function leadlaju_private.enqueue_sales_contact_reminders(timestamptz) from public,anon,authenticated,service_role;

-- Service-only validation is repeated for every delivery/retry/device.
create function public.validate_sales_contact_reminder(p_user_id uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid; recipient public.profiles; items jsonb; n integer;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' and session_user<>'postgres' then raise exception 'Worker only' using errcode='42501'; end if;
 bid:=(p_payload->>'brandId')::uuid;
 select * into recipient from public.profiles where id=p_user_id and brand_id=bid and active and approval_status='approved';
 if recipient.id is null or not exists(select 1 from public.brands where id=bid and active and distribution_mode='team_sales') then return null; end if;
 if p_type='sales_contact_admin' then
 if recipient.role<>'admin' then return null; end if;
 select jsonb_agg(x.value) into items from jsonb_array_elements(p_payload->'items') x join public.leads l on l.id=(x.value->>'id')::uuid
 join public.profiles p on p.id=l.assigned_agent_id and p.brand_id=bid and p.active and p.approval_status='approved' and p.role='agent'
 where l.brand_id=bid and l.status='new' and l.queue_state='sales_assigned' and l.assignment_revision=(x.value->>'revision')::bigint and l.assigned_agent_id=(x.value->>'owner')::uuid and l.created_at<=now()-interval '1 hour';
 if items is null then return null; end if;
 n:=jsonb_array_length(items);
 return p_payload||jsonb_build_object('items',items,'body',n||' lead belum contact melebihi 1 jam.');
 end if;
 if p_type not in ('sales_contact_15','sales_contact_60') or recipient.role<>'agent' then return null; end if;
 if not exists(select 1 from public.leads l where l.id=(p_payload->>'lead_id')::uuid and l.brand_id=bid and l.assigned_agent_id=p_user_id and l.assigned_agent_id=(p_payload->>'owner_id')::uuid and l.assignment_revision=(p_payload->>'assignment_revision')::bigint and l.status='new' and l.queue_state='sales_assigned'
 and l.created_at>=(select activated_at from leadlaju_private.sales_reminder_release)
 and l.created_at<=now()-case when p_type='sales_contact_60' then interval '1 hour' else interval '15 minutes' end
 and (p_type<>'sales_contact_15' or l.created_at>now()-interval '1 hour')) then return null; end if;
 return p_payload;
end $$;
revoke all on function public.validate_sales_contact_reminder(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.validate_sales_contact_reminder(uuid,text,jsonb) to service_role;
select cron.schedule('leadlaju-sales-contact-reminders','* * * * *','select leadlaju_private.enqueue_sales_contact_reminders(clock_timestamp())');
