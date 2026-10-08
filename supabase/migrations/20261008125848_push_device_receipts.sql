alter table public.push_subscriptions
 add column app_installed boolean not null default false,
 add column device_seen_at timestamptz,
 add column device_received_at timestamptz,
 add column device_logged_out_at timestamptz,
 add column device_check_at timestamptz,
 add column device_check_confirmed_at timestamptz,
 add column device_check_ready boolean;

create table leadlaju_private.push_device_checks (
 subscription_id uuid primary key references public.push_subscriptions(id) on delete cascade,
 challenge uuid not null unique,
 expires_at timestamptz not null
);
alter table leadlaju_private.push_device_checks enable row level security;
revoke all on leadlaju_private.push_device_checks from public,anon,authenticated,service_role;

create table leadlaju_private.push_receipts (
 token_hash text primary key,
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 outbox_id bigint not null references public.notification_outbox(id) on delete cascade,
 expires_at timestamptz not null,
 acknowledged_at timestamptz,
 unique(subscription_id,outbox_id)
);
alter table leadlaju_private.push_receipts enable row level security;
create index push_receipts_expiry_idx on leadlaju_private.push_receipts(expires_at);
select cron.schedule('leadlaju-push-receipt-cleanup','0 18 * * *','delete from leadlaju_private.push_receipts where expires_at<now()');
revoke all on leadlaju_private.push_receipts from public,anon,authenticated,service_role;

create function public.touch_push_device(p_endpoint text,p_installed boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501'; end if;
 update public.push_subscriptions s set app_installed=coalesce(p_installed,false),device_seen_at=now(),device_logged_out_at=null
 where s.endpoint=p_endpoint and s.user_id=auth.uid() and s.active
 and exists(select 1 from public.profiles p join public.brands b on b.id=p.brand_id and b.active where p.id=s.user_id and p.brand_id=s.brand_id and p.active and p.approval_status='approved');
 return found;
end $$;

create function public.get_push_device_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand(); result jsonb;
begin
 if auth.uid() is null or bid is null or not exists(select 1 from public.profiles where id=auth.uid() and active and approval_status='approved') then raise exception 'Active account required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'userId',s.user_id,'active',s.active,'installed',s.app_installed,
 'device',case when s.user_agent ilike '%iPhone%' then 'iPhone' when s.user_agent ilike '%Android%' then 'Android' else 'Browser' end,
 'seenAt',s.device_seen_at,'receivedAt',s.device_received_at,'acceptedAt',s.last_success_at,'failureAt',s.last_failure_at,'loggedOutAt',s.device_logged_out_at,
 'checkAt',s.device_check_at,'checkConfirmedAt',s.device_check_confirmed_at,'checkReady',s.device_check_ready)
 order by s.device_seen_at desc nulls last),'[]'::jsonb) into result
 from public.push_subscriptions s where s.brand_id=bid and (s.user_id=auth.uid() or leadlaju_private.is_admin(auth.uid()));
 return result;
end $$;

create function public.admin_check_push_device(p_subscription_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.push_subscriptions; bid uuid:=leadlaju_private.request_brand(); nonce uuid:=extensions.gen_random_uuid();
begin
 if auth.uid() is null or not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required' using errcode='42501'; end if;
 select * into s from public.push_subscriptions where id=p_subscription_id and brand_id=bid for update;
 if s.id is null then raise exception 'Device outside brand' using errcode='42501'; end if;
 if s.device_check_at>now()-interval '15 seconds' then raise exception 'Tunggu 15 saat sebelum semak semula'; end if;
 update public.push_subscriptions set device_check_at=now(),device_check_confirmed_at=null,device_check_ready=null where id=s.id;
 if s.active then
   insert into leadlaju_private.push_device_checks(subscription_id,challenge,expires_at) values(s.id,nonce,now()+interval '2 minutes')
   on conflict(subscription_id) do update set challenge=excluded.challenge,expires_at=excluded.expires_at;
   perform realtime.send(jsonb_build_object('deviceId',s.id,'challenge',nonce),'push_device_probe','user:'||s.user_id::text,true);
 end if;
 return jsonb_build_object('ok',true,'active',s.active,'installed',s.app_installed,'receivedAt',s.device_received_at,'seenAt',s.device_seen_at,
   'accountEligible',exists(select 1 from public.profiles p join public.brands b on b.id=p.brand_id and b.active where p.id=s.user_id and p.brand_id=bid and p.active and p.approval_status='approved'));
end $$;

create function public.answer_push_device_probe(p_challenge uuid,p_endpoint text,p_installed boolean,p_permission boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if auth.uid() is null then return false; end if;
 select s.id into sid from public.push_subscriptions s join leadlaju_private.push_device_checks c on c.subscription_id=s.id
 join public.profiles p on p.id=s.user_id and p.brand_id=s.brand_id and p.active and p.approval_status='approved'
 join public.brands b on b.id=s.brand_id and b.active
 where c.challenge=p_challenge and c.expires_at>now() and s.user_id=auth.uid() and s.endpoint=p_endpoint and s.active for update of s;
 if sid is null then return false; end if;
 update public.push_subscriptions set device_check_confirmed_at=now(),device_check_ready=coalesce(p_permission,false),
 app_installed=coalesce(p_installed,false),device_seen_at=now() where id=sid;
 delete from leadlaju_private.push_device_checks where subscription_id=sid;
 return true;
end $$;

create function public.issue_push_receipt(p_subscription_id uuid,p_outbox_id bigint) returns text
language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex');
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Worker required' using errcode='42501'; end if;
 if not exists(select 1 from public.push_subscriptions s join public.notification_outbox n on n.user_id=s.user_id and n.brand_id=s.brand_id join public.profiles p on p.id=s.user_id and p.active join public.brands b on b.id=s.brand_id and b.active where s.id=p_subscription_id and s.active and n.id=p_outbox_id) then return null; end if;
 insert into leadlaju_private.push_receipts(token_hash,subscription_id,outbox_id,expires_at)
 values(encode(extensions.digest(token,'sha256'),'hex'),p_subscription_id,p_outbox_id,now()+interval '2 days')
 on conflict(subscription_id,outbox_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,acknowledged_at=null;
 return token;
end $$;

-- Narrow capability endpoint: possession of an unguessable delivery token proves
-- that this specific push payload reached its service worker. No login token stored in SW.
create function public.acknowledge_push_receipt(p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r leadlaju_private.push_receipts;
begin
 if p_token is null or length(p_token)<>64 then return false; end if;
 select * into r from leadlaju_private.push_receipts where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now() for update;
 if r.subscription_id is null then return false; end if;
 if not exists(select 1 from public.push_subscriptions s join public.profiles p on p.id=s.user_id and p.brand_id=s.brand_id and p.active and p.approval_status='approved' join public.brands b on b.id=s.brand_id and b.active where s.id=r.subscription_id and s.active and s.device_logged_out_at is null) then return false; end if;
 if r.acknowledged_at is not null then return true; end if;
 update leadlaju_private.push_receipts set acknowledged_at=now() where token_hash=r.token_hash;
 update public.push_subscriptions set device_received_at=now() where id=r.subscription_id;
 return true;
end $$;

create function leadlaju_private.broadcast_push_device() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform realtime.send(jsonb_build_object('userId',new.user_id),'push_device_changed','user:'||new.user_id::text,true);
 perform realtime.send(jsonb_build_object('userId',new.user_id),'push_device_changed','brand:'||new.brand_id::text||':operations',true);
 return new;
end $$;
revoke all on function leadlaju_private.broadcast_push_device() from public,anon,authenticated,service_role;
create trigger push_device_status_broadcast after update of active,device_seen_at,device_received_at,device_logged_out_at,device_check_at,device_check_confirmed_at,last_success_at,last_failure_at on public.push_subscriptions for each row execute function leadlaju_private.broadcast_push_device();

create function leadlaju_private.mark_push_device_logout() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.active and not new.active then
  new.device_received_at=null;
  new.device_check_confirmed_at=null;
  new.device_check_ready=null;
  new.device_logged_out_at=case when auth.uid()=old.user_id then now() else null end;
  delete from leadlaju_private.push_receipts where subscription_id=old.id;
  delete from leadlaju_private.push_device_checks where subscription_id=old.id;
 end if;
 return new;
end $$;
create trigger push_device_logout before update of active on public.push_subscriptions for each row execute function leadlaju_private.mark_push_device_logout();
revoke all on function leadlaju_private.mark_push_device_logout() from public,anon,authenticated,service_role;

revoke all on function public.touch_push_device(text,boolean),public.get_push_device_status(),public.admin_check_push_device(uuid),public.answer_push_device_probe(uuid,text,boolean,boolean),public.issue_push_receipt(uuid,bigint),public.acknowledge_push_receipt(text) from public,anon,authenticated;
grant execute on function public.touch_push_device(text,boolean),public.get_push_device_status(),public.admin_check_push_device(uuid),public.answer_push_device_probe(uuid,text,boolean,boolean) to authenticated;
grant execute on function public.issue_push_receipt(uuid,bigint) to service_role;
grant execute on function public.acknowledge_push_receipt(text) to anon,authenticated;
