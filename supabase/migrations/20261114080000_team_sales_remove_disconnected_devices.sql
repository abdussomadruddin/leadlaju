-- Team Sales Admin/Master can remove disconnected (inactive or logged-out)
-- push devices from the device report. Active devices are never removed.
-- Agent-mode brands are unchanged.
create function public.admin_remove_disconnected_push_devices(p_subscription_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand(); removed integer;
begin
 if auth.uid() is null or not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required' using errcode='42501';end if;
 if not exists(select 1 from public.brands where id=bid and active and distribution_mode='team_sales') then
   raise exception 'Active Team Sales brand required' using errcode='42501';
 end if;
 with gone as (
   delete from public.push_subscriptions s
   where s.brand_id=bid and (not s.active or s.device_logged_out_at is not null)
     and (p_subscription_id is null or s.id=p_subscription_id)
   returning s.user_id
 ) select count(*) into removed from gone;
 if p_subscription_id is not null and removed=0 then
   raise exception 'Peranti tiada atau masih bersambung' using errcode='22023';
 end if;
 if removed>0 then
   perform realtime.send(jsonb_build_object('brandId',bid),'push_device_changed','brand:'||bid::text||':operations',true);
 end if;
 return jsonb_build_object('ok',true,'removed',removed);
end $$;

do $ownership$
declare had_create boolean:=has_schema_privilege('leadlaju_tenant_executor','public','CREATE');
begin
 if not had_create then grant create on schema public to leadlaju_tenant_executor;end if;
 alter function public.admin_remove_disconnected_push_devices(uuid) owner to leadlaju_tenant_executor;
 if not had_create then revoke create on schema public from leadlaju_tenant_executor;end if;
end $ownership$;
revoke all on function public.admin_remove_disconnected_push_devices(uuid) from public,anon,service_role;
grant execute on function public.admin_remove_disconnected_push_devices(uuid) to authenticated;
