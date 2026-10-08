alter table public.push_subscriptions add column device_check_received_at timestamptz;
create or replace function public.get_push_device_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand(); result jsonb;
begin
 if auth.uid() is null or bid is null or not exists(select 1 from public.profiles where id=auth.uid() and active and approval_status='approved') then raise exception 'Active account required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'userId',s.user_id,'active',s.active,'installed',s.app_installed,
 'device',case when s.user_agent ilike '%iPhone%' then 'iPhone' when s.user_agent ilike '%Android%' then 'Android' else 'Browser' end,
 'seenAt',s.device_seen_at,'receivedAt',s.device_received_at,'acceptedAt',s.last_success_at,'failureAt',s.last_failure_at,'loggedOutAt',s.device_logged_out_at,
 'checkReceivedAt',s.device_check_received_at,'checkAt',s.device_check_at,'checkConfirmedAt',s.device_check_confirmed_at,'checkReady',s.device_check_ready)
 order by s.device_seen_at desc nulls last),'[]'::jsonb) into result
 from public.push_subscriptions s where s.brand_id=bid and (s.user_id=auth.uid() or leadlaju_private.is_admin(auth.uid()));
 return result;
end $$;
create or replace function public.acknowledge_push_receipt(p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r leadlaju_private.push_receipts;
begin
 if p_token is null or length(p_token)<>64 then return false; end if;
 select * into r from leadlaju_private.push_receipts where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now() for update;
 if r.subscription_id is null then return false; end if;
 if not exists(select 1 from public.push_subscriptions s join public.profiles p on p.id=s.user_id and p.brand_id=s.brand_id and p.active and p.approval_status='approved' join public.brands b on b.id=s.brand_id and b.active where s.id=r.subscription_id and s.active and s.device_logged_out_at is null) then return false; end if;
 if r.acknowledged_at is not null then return true; end if;
 update leadlaju_private.push_receipts set acknowledged_at=now() where token_hash=r.token_hash;
 update public.push_subscriptions set device_received_at=now(),device_check_received_at=case when exists(select 1 from public.notification_outbox n where n.id=r.outbox_id and n.notification_type='admin_follow_up' and (n.payload->>'checkStartedAt')::timestamptz=public.push_subscriptions.device_check_at) then now() else device_check_received_at end where id=r.subscription_id;
 return true;
end $$;
create or replace function public.broadcast_follow_up_reminder(p_message text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); bid uuid:=leadlaju_private.request_brand(); rid uuid; started timestamptz:=now(); admin_name text;
begin
 if not leadlaju_private.is_admin(uid) or bid is null or not exists(select 1 from public.brands where id=bid and active) then raise exception 'Active brand admin required' using errcode='42501'; end if;
 if coalesce(trim(p_message),'')='' then raise exception 'Message required'; end if;
 if exists(select 1 from public.reminders where brand_id=bid and created_by_id=uid and created_at>now()-interval '30 seconds') then raise exception 'Tunggu 30 saat sebelum hantar semula'; end if;
 select name into admin_name from public.profiles where id=uid;
 insert into public.reminders(brand_id,created_by_id,target,message) values(bid,uid,'agents',trim(p_message)) returning id into rid;
 update public.push_subscriptions s set device_check_at=started,device_check_received_at=null
 where s.brand_id=bid and s.active and exists(select 1 from public.profiles p where p.id=s.user_id and p.brand_id=bid and p.role='agent' and p.active and p.approval_status='approved');
 insert into public.notification_outbox(brand_id,user_id,notification_type,payload,dedupe_key)
 select bid,p.id,'admin_follow_up',jsonb_build_object('title','Admin remind follow up','body',coalesce(admin_name,'Admin')||': '||trim(p_message),'tag','leadlaju-admin-reminder-'||rid::text,'view','follow-up-due','url','/?view=follow-up-due','requireInteraction',true,'checkStartedAt',started),'admin_follow_up:'||rid::text||':'||p.id::text
 from public.profiles p where p.brand_id=bid and p.role='agent' and p.active and p.approval_status='approved' on conflict do nothing;
 return jsonb_build_object('ok',true,'id',rid);
end $$;
