create or replace function public.touch_push_device(p_endpoint text,p_installed boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501'; end if;
 update public.push_subscriptions s set app_installed=coalesce(p_installed,false),device_seen_at=now(),device_logged_out_at=null,device_check_ready=true
 where s.endpoint=p_endpoint and s.user_id=auth.uid() and s.active
 and exists(select 1 from public.profiles p join public.brands b on b.id=p.brand_id and b.active where p.id=s.user_id and p.brand_id=s.brand_id and p.active and p.approval_status='approved');
 return found;
end $$;

create or replace function public.admin_check_push_device(p_subscription_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.push_subscriptions; bid uuid:=leadlaju_private.request_brand(); nonce uuid:=extensions.gen_random_uuid();
begin
 if auth.uid() is null or not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required' using errcode='42501'; end if;
 select * into s from public.push_subscriptions where id=p_subscription_id and brand_id=bid for update;
 if s.id is null then raise exception 'Device outside brand' using errcode='42501'; end if;
 if s.device_check_at>now()-interval '15 seconds' then raise exception 'Tunggu 15 saat sebelum semak semula'; end if;
 update public.push_subscriptions set device_check_at=now() where id=s.id;
 if s.active then
   insert into leadlaju_private.push_device_checks(subscription_id,challenge,expires_at) values(s.id,nonce,now()+interval '2 minutes')
   on conflict(subscription_id) do update set challenge=excluded.challenge,expires_at=excluded.expires_at;
   perform realtime.send(jsonb_build_object('deviceId',s.id,'challenge',nonce),'push_device_probe','user:'||s.user_id::text,true);
 end if;
 return jsonb_build_object('ok',true,'active',s.active,'installed',s.app_installed,'receivedAt',s.device_received_at,'seenAt',s.device_seen_at,
   'accountEligible',exists(select 1 from public.profiles p join public.brands b on b.id=p.brand_id and b.active where p.id=s.user_id and p.brand_id=bid and p.active and p.approval_status='approved'));
end $$;
