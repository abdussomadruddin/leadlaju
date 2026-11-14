-- Disposable local PostgreSQL only. Team Sales removal of disconnected push devices.
begin;
select set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true);
do $test$
declare s uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); ag uuid:=gen_random_uuid();
 adm uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid(); other_m uuid:=gen_random_uuid(); ag_adm uuid:=gen_random_uuid(); ag_m uuid:=gen_random_uuid();
 live uuid:=gen_random_uuid(); dead uuid:=gen_random_uuid(); dead2 uuid:=gen_random_uuid(); out uuid:=gen_random_uuid(); other_dead uuid:=gen_random_uuid(); ag_dead uuid:=gen_random_uuid(); r jsonb;
begin
 insert into public.brands(id,name,slug,distribution_mode) values(s,'Dev sales','dev-'||s,'team_sales'),(other,'Dev other','dev-'||other,'team_sales');
 insert into public.brands(id,name,slug) values(ag,'Dev agent','dev-'||ag);
 insert into auth.users(id,email) select id,id||'@test.invalid' from unnest(array[adm,m,m2,other_m,ag_adm,ag_m]) id;
 insert into public.profiles(id,brand_id,name,email,role,active,approval_status) values
  (adm,s,'Admin',adm||'@test.invalid','admin',true,'approved'),(m,s,'M',m||'@test.invalid','agent',true,'approved'),(m2,s,'M2',m2||'@test.invalid','agent',true,'approved'),
  (other_m,other,'O',other_m||'@test.invalid','agent',true,'approved'),(ag_adm,ag,'AA',ag_adm||'@test.invalid','admin',true,'approved'),(ag_m,ag,'AM',ag_m||'@test.invalid','agent',true,'approved');
 insert into public.push_subscriptions(id,brand_id,user_id,endpoint,p256dh,auth,active,device_logged_out_at) values
  (live,s,m,'https://push.test/'||live,'k','a',true,null),(dead,s,m,'https://push.test/'||dead,'k','a',false,null),
  (dead2,s,m2,'https://push.test/'||dead2,'k','a',false,null),(out,s,m2,'https://push.test/'||out,'k','a',true,now()),
  (other_dead,other,other_m,'https://push.test/'||other_dead,'k','a',false,null),(ag_dead,ag,ag_m,'https://push.test/'||ag_dead,'k','a',false,null);

 if has_function_privilege('anon','public.admin_remove_disconnected_push_devices(uuid)','execute') then raise exception 'Anon access';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
 begin perform public.admin_remove_disconnected_push_devices(null);raise exception 'Member accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ag_adm,'role','authenticated')::text,true);
 begin perform public.admin_remove_disconnected_push_devices(null);raise exception 'Agent brand accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',adm,'role','authenticated')::text,true);
 begin perform public.admin_remove_disconnected_push_devices(live);raise exception 'Active device removed';exception when invalid_parameter_value then null;end;
 begin perform public.admin_remove_disconnected_push_devices(other_dead);raise exception 'Other brand device removed';exception when invalid_parameter_value then null;end;
 r:=public.admin_remove_disconnected_push_devices(dead);
 if (r->>'removed')::int<>1 or exists(select 1 from public.push_subscriptions where id=dead) then raise exception 'Single removal failed';end if;
 r:=public.admin_remove_disconnected_push_devices(null);
 if (r->>'removed')::int<>2 then raise exception 'Bulk removed %',r;end if;
 if not exists(select 1 from public.push_subscriptions where id=live) then raise exception 'Live device removed';end if;
 if not exists(select 1 from public.push_subscriptions where id=other_dead) or not exists(select 1 from public.push_subscriptions where id=ag_dead) then raise exception 'Other brands touched';end if;
 if (public.admin_remove_disconnected_push_devices(null)->>'removed')::int<>0 then raise exception 'Repeat not idempotent';end if;
end $test$;
select 'PASS Team Sales disconnected device removal: admin only, own brand, active devices kept, agent brands untouched' result;
rollback;
